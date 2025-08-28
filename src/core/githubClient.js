// githubClient.js
// Minimal, dependency-free GitHub client for Chrome extensions (MV3-safe).
// Handles: ensure repo, ensure branch, single-file commit (Contents API),
// batch commit (Git Data API), open/merge PR. MIT.

const GH_API = 'https://api.github.com';
const GH_HEADERS = (token) => ({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
});

// ---------- Utilities ----------
export function uuidv4() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    a[6] = (a[6] & 0x0f) | 0x40;
    a[8] = (a[8] & 0x3f) | 0x80;
    const h = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function base64EncodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

export function tsSlug(d = new Date()) {
    const p2 = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}

export function uniquePath({ prefix = 'ingest', ext = 'json', name = '' } = {}) {
    const stamp = tsSlug();
    const id = uuidv4();
    const base = name ? name.replace(/[^\w.-]/g, '_') : id;
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    // e.g. ingest/2025/08/28/2025-08-28T174200Z-<uuid>_summary.json
    return `${prefix}/${yyyy}/${mm}/${dd}/${stamp}-${base}.${ext}`;
}

// ---------- File header object ----------
export class GitFileHeader {
    constructor({ path, content, mode = '100644', type = 'blob', encoding = 'utf-8' }) {
        this.path = path;
        this.content = content;
        this.mode = mode;
        this.type = type;
        this.encoding = encoding;
    }

    static fromText({ prefix = 'ingest', name = '', ext = 'txt', text = '' }) {
        const path = uniquePath({ prefix, ext, name });
        return new GitFileHeader({ path, content: text });
    }

    static fromJson({ prefix = 'ingest', name = '', obj = {}, pretty = true }) {
        const text = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
        const path = uniquePath({ prefix, ext: 'json', name });
        return new GitFileHeader({ path, content: text });
    }

    toTreeEntry() {
        return { path: this.path, mode: this.mode, type: this.type, content: this.content };
    }

    toContentsPayload(commitMessage, branch) {
        return {
            message: commitMessage,
            content: base64EncodeUtf8(this.content),
            branch
            // sha omitted: we always add new unique paths, so no update conflict.
        };
    }
}

// ---------- GitHub client ----------
export class GitHubClient {
    /**
     * @param {{token:string, owner:string, repo:string, apiBase?:string}} cfg
     */
    constructor({ token, owner, repo, apiBase = GH_API }) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
        this.apiBase = apiBase;
    }

    async _req(path, init = {}) {
        const res = await fetch(`${this.apiBase}${path}`, {
            ...init,
            headers: { ...GH_HEADERS(this.token), ...(init.headers || {}) }
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`GitHub ${init.method || 'GET'} ${path} -> ${res.status}: ${text}`);
        }
        return res.status === 204 ? null : res.json();
    }

    // ---- Auth’d user ----
    async getAuthenticatedUser() { return this._req(`/user`); }

    // ---- Repo mgmt ----
    async getRepo() { return this._req(`/repos/${this.owner}/${this.repo}`); }

    async repoExists() {
        try { await this.getRepo(); return true; }
        catch { return false; }
    }

    async createUserRepo({ name, description = '', isPrivate = true, autoInit = true }) {
        return this._req(`/user/repos`, {
            method: 'POST',
            body: JSON.stringify({
                name,
                description,
                private: isPrivate,
                auto_init: autoInit,
                has_issues: false, has_projects: false, has_wiki: false
            })
        });
    }

    async createOrgRepo({ org, name, description = '', isPrivate = true, autoInit = true }) {
        return this._req(`/orgs/${org}/repos`, {
            method: 'POST',
            body: JSON.stringify({
                name,
                description,
                private: isPrivate,
                auto_init: autoInit,
                has_issues: false, has_projects: false, has_wiki: false
            })
        });
    }

    async ensureRepo({ name = this.repo, org = null, description = '', isPrivate = true, autoInit = true } = {}) {
        const exists = await this.repoExists();
        if (exists) return { created: false };
        if (org) await this.createOrgRepo({ org, name, description, isPrivate, autoInit });
        else await this.createUserRepo({ name, description, isPrivate, autoInit });
        return { created: true };
    }

    // ---- Branches / refs ----
    async getDefaultBranch() { const repo = await this.getRepo(); return repo.default_branch; }
    async getRef(branch) { return this._req(`/repos/${this.owner}/${this.repo}/git/ref/heads/${encodeURIComponent(branch)}`); }
    async getRefSha(branch) { const ref = await this.getRef(branch); return ref.object.sha; }
    async createBranch(fromBranch, newBranch) {
        const sha = await this.getRefSha(fromBranch);
        return this._req(`/repos/${this.owner}/${this.repo}/git/refs`, {
            method: 'POST', body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha })
        });
    }
    async ensureBranch(fromBranch, newBranch) {
        try { await this.getRef(newBranch); return { created: false, branch: newBranch }; }
        catch { await this.createBranch(fromBranch, newBranch); return { created: true, branch: newBranch }; }
    }

    // ---- Contents API (single-file) ----
    async putFileViaContentsAPI(fileHeader, commitMessage, branch) {
        return this._req(
            `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(fileHeader.path)}`,
            { method: 'PUT', body: JSON.stringify(fileHeader.toContentsPayload(commitMessage, branch)) }
        );
    }

    // ---- Git Data API (batch) ----
    async getCommit(sha) { return this._req(`/repos/${this.owner}/${this.repo}/git/commits/${sha}`); }

    async createTree(baseTreeSha, treeEntries) {
        return this._req(`/repos/${this.owner}/${this.repo}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
        });
    }

    async createCommit(message, treeSha, parentSha) {
        return this._req(`/repos/${this.owner}/${this.repo}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] })
        });
    }

    async updateBranchRef(branch, commitSha) {
        return this._req(`/repos/${this.owner}/${this.repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
            method: 'PATCH', body: JSON.stringify({ sha: commitSha, force: false })
        });
    }

    async commitFilesToBranch({ base = 'main', branch, files = [], message = 'data ingest' }) {
        await this.ensureBranch(base, branch);
        const headSha = await this.getRefSha(branch);
        const headCommit = await this.getCommit(headSha);
        const newTree = await this.createTree(headCommit.tree.sha, files.map(f => f.toTreeEntry()));
        const newCommit = await this.createCommit(message, newTree.sha, headSha);
        await this.updateBranchRef(branch, newCommit.sha);
        return { commitSha: newCommit.sha, branch };
    }

    // ---- PRs ----
    async openPullRequest({ title, body = '', base = 'main', head }) {
        return this._req(`/repos/${this.owner}/${this.repo}/pulls`, {
            method: 'POST', body: JSON.stringify({ title, body, base, head })
        });
    }

    async mergePullRequest(prNumber, method = 'squash', commitTitle, commitMessage) {
        return this._req(`/repos/${this.owner}/${this.repo}/pulls/${prNumber}/merge`, {
            method: 'PUT',
            body: JSON.stringify({
                merge_method: method,
                commit_title: commitTitle,
                commit_message: commitMessage
            })
        });
    }

    async ingestFilesAndPR({ base = 'main', files = [], prTitle = 'Data ingest', prBody = '', autoMerge = false }) {
        const branch = `ingest/${tsSlug()}-${uuidv4().slice(0, 8)}`;
        await this.ensureBranch(base, branch);
        await this.commitFilesToBranch({ base, branch, files, message: prTitle });
        const pr = await this.openPullRequest({ title: prTitle, body: prBody, base, head: branch });
        if (autoMerge) {
            try { await this.mergePullRequest(pr.number, 'squash', prTitle, prBody); pr.merged = true; }
            catch (e) { pr.merged = false; pr.mergeError = e.message; }
        }
        return pr;
    }
}
// Example usage:
/*

import { GitHubClient, GitFileHeader } from './githubClient.js';

// 1) Build client
const client = new GitHubClient({ token, owner: 'you', repo: 'link-to-replika-data' });

// 2) Ensure repo exists (make it private, auto README)
await client.ensureRepo({
  name: 'link-to-replika-data',
  description: 'Raw captures & logs from the Link-to-Replika extension',
  isPrivate: true,
  autoInit: true,   // README on initial commit
  // org: 'your-org' // <-- pass this to create inside an org
});

// 3) Add files (always-add using timestamp/uuid paths, no conflicts)
const files = [
  GitFileHeader.fromJson({ prefix: 'sessions', name: 'summary', obj: { at: Date.now(), notes: 'hello' } }),
  GitFileHeader.fromText({  prefix: 'raw',      name: 'capture', ext: 'txt', text: 'some raw text' })
];

await client.ingestFilesAndPR({
  base: 'main',
  files,
  prTitle: 'LinkToReplika ingest',
  prBody: 'Auto-ingested artifacts from the extension.',
  autoMerge: true
});


*/
