// src/content/components/ChessOverlay.js
import { Chess } from 'chess.js';
import { injectReply } from '../../core/replika-dom.js';
import { extractChessMove } from '../../core/openai.js';

// --- Local move matching helpers (SAN/UCI) ---

function escapeRegex(s) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function normalizeMsg(text) {
    // normalize punctuation and dashes; keep letters/numbers
    return text
        .replace(/[–—]/g, '-')   // en/em dashes -> hyphen
        .replace(/[’]/g, "'")
        .replace(/O/g, 'O')      // keep letter O
        .replace(/0/g, '0')      // keep zero
        ;
}

function sanVariantsForMatch(san) {
    // chess.js SAN may include trailing + or #; people often omit them
    const base = san.replace(/[+#]$/, '');
    // Allow both O-O and 0-0 forms
    const castleAlt = base
        .replace(/^O-O-O$/i, '0-0-0')
        .replace(/^O-O$/i, '0-0');

    // Build a small set of unique variants
    const set = new Set([san, base, castleAlt]);
    return [...set].filter(Boolean);
}

function legalMoveSets(game) {
    const verbose = game.moves({ verbose: true });
    const sanList = verbose.map(m => m.san);
    const uciList = verbose.map(m => m.from + m.to + (m.promotion || ''));

    // Map normalized SAN variant -> canonical SAN we’ll apply
    const sanMap = new Map();
    for (const san of sanList) {
        for (const v of sanVariantsForMatch(san)) {
            sanMap.set(v.toLowerCase(), san); // case-insensitive compare
        }
    }

    const uciSet = new Set(uciList.map(s => s.toLowerCase()));
    return { sanMap, uciSet };
}

/**
 * Try to find a legal move mentioned directly in the text.
 * - First: detect any UCI-looking ... e2e4, e7e8q ... and confirm it’s legal.
 * - Then: search for any legal SAN token (case-insensitive, +/# optional).
 * Returns { notation: 'uci'|'san', move: string } | null
 */
function findLegalMoveInText(game, rawText) {
    const text = normalizeMsg(rawText);
    const lower = text.toLowerCase();
    const { sanMap, uciSet } = legalMoveSets(game);

    // 1) UCI pattern(s)
    const uciRe = /\b([a-h][1-8][a-h][1-8][qrbn]?)\b/gi;
    let m;
    while ((m = uciRe.exec(lower))) {
        const uci = m[1];
        if (uciSet.has(uci)) return { notation: 'uci', move: uci };
    }

    // 2) SAN token match. Build one combined regex of all SAN variants for speed.
    //    Example variants: "e4", "Nf3", "Bxe6", "O-O", "0-0", with optional +/# possibly omitted by the user.
    //    We already stripped +/# in sanVariantsForMatch when we built the keys.
    const tokens = [...sanMap.keys()]
        // Sort longer first to avoid matching "e4" inside "Be4"
        .sort((a, b) => b.length - a.length)
        .map(escapeRegex);

    if (tokens.length) {
        const sanBigRe = new RegExp(`(^|[^a-z0-9])(${tokens.join('|')})([^a-z0-9]|$)`, 'i');
        const hit = sanBigRe.exec(text);
        if (hit && hit[2]) {
            const key = hit[2].toLowerCase();
            const canonicalSan = sanMap.get(key);
            if (canonicalSan) return { notation: 'san', move: canonicalSan.replace(/[+#]$/, '') };
        }
    }

    // 3) Optional: “castle kingside/queenside” synonyms → map to SAN if legal
    if (/\bcastle\b/i.test(text)) {
        const wantShort = /\b(kingside|short)\b/i.test(text);
        const wantLong = /\b(queenside|long)\b/i.test(text);
        const candidates = [];
        if (wantShort) candidates.push('O-O', '0-0');
        if (wantLong) candidates.push('O-O-O', '0-0-0');
        for (const c of candidates) {
            const key = c.toLowerCase();
            if (sanMap.has(key)) return { notation: 'san', move: sanMap.get(key).replace(/[+#]$/, '') };
        }
    }

    return null;
}

function injectStyles() {
    if (document.getElementById('__l2r_chess_styles')) return;
    const style = document.createElement('style');
    style.id = '__l2r_chess_styles';
    style.textContent = `
    
  #__l2r_chess_toggle {
    position: fixed; top: 232px; left: 12px; z-index: 2147483646;
  }
  #__l2r_chess_container {
    position: fixed; left: 12px; bottom: 12px; width: 420px; height: 420px;
    z-index: 2147483646;
    background: #0b1220; border: 1px solid #1f2937; border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.35); padding: 8px;
  }
  #__l2r_chess_header { display:flex; align-items:center; gap:8px; margin-bottom:6px; color:#e5e7eb; font-size:12px; }
  #__l2r_chess_header .spacer { flex:1; }

  /* board grid */
  #__l2r_grid {
    display:grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(8, 1fr);
    width:100%; height: calc(100% - 30px); border-radius:8px; overflow:hidden; user-select:none;
    border: 2px solid #111;
  }
  .sq { display:flex; align-items:center; justify-content:center; }
  .l { background-image: url('https://github.com/zythis-xorandor/replika-chess/blob/main/src/assets/whiteTile.png?raw=true'); }   /* light squares */
  .d { background-image: url('https://github.com/zythis-xorandor/replika-chess/blob/main/src/assets/blackTile.png?raw=true'); }   /* dark squares */

  /* unicode piece styling */
  .pc { line-height: 1; font-size: 44px; }
  /* always outline white pieces in black */
  .pc.w {
    color: #ffffff;
    -webkit-text-stroke: 1px #000000;
    text-shadow:
      0 0 1px #000, 0 0 1px #000,
      1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000;
    filter: drop-shadow(0 0 1px rgba(0,0,0,.6));
  }
  /* always outline black pieces in white */
  .pc.b {
    color: #000000;
    -webkit-text-stroke: 1px #ffffff;
    text-shadow:
      0 0 1px #fff, 0 0 1px #fff,
      1px 0 0 #fff, -1px 0 0 #fff, 0 1px 0 #fff, 0 -1px 0 #fff;
    filter: drop-shadow(0 0 1px rgba(255,255,255,.6));
  }

  /* selected square highlight */
  .hi { box-shadow: inset 0 0 0 3px rgba(255,230,0,.9); }

  @media (max-width: 520px) {
    #__l2r_chess_container { left: 8px; bottom: 8px; width: calc(100vw - 16px); height: calc(100vw - 16px); }
    .pc { font-size: calc((100vw - 16px) / 8 * 0.84); }
  }

  `;
    document.documentElement.appendChild(style);
}

const PIECE_UNICODE = {
    w: { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' },
    b: { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' },
};

function squareColor(file, rank) {
    const f = 'abcdefgh'.indexOf(file);
    const r = parseInt(rank, 10);
    return (f + r) % 2 ? 'l' : 'd'; // a1 dark convention
}

function renderBoard(gridEl, game, selected) {
    gridEl.innerHTML = '';
    for (let r = 8; r >= 1; r--) {
        for (let f = 0; f < 8; f++) {
            const sq = 'abcdefgh'[f] + r;
            const div = document.createElement('div');
            div.className = `sq ${squareColor('abcdefgh'[f], r)}` + (selected === sq ? ' hi' : '');
            div.dataset.square = sq;

            const piece = game.get(sq); // { type:'p', color:'w'|'b' } or null
            //if (piece) div.textContent = PIECE_UNICODE[piece.color][piece.type];
            if (piece) {
                const span = document.createElement('span');
                span.className = `pc ${piece.color}`;          // .pc.w or .pc.b
                span.textContent = PIECE_UNICODE[piece.color][piece.type];
                div.appendChild(span);
            }
            gridEl.appendChild(div);
        }
    }
}

export function installChessOverlay(bus) {
    injectStyles();

    // Toggle button (top-left)
    let btn = document.getElementById('__l2r_chess_toggle');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = '__l2r_chess_toggle';
        btn.textContent = '♟ Chess';
        btn.className = 'l2r-btn';
        document.documentElement.appendChild(btn);
    }

    // Board container (bottom-left, 420x420)
    let container = document.getElementById('__l2r_chess_container');
    if (!container) {
        container = document.createElement('div');
        container.id = '__l2r_chess_container';
        container.innerHTML = `
      <div id="__l2r_chess_header">
        <strong>Chess</strong>
        <span class="spacer"></span>
        <button id="__l2r_chess_new"
          style="font:inherit;padding:4px 8px;border-radius:8px;
          border:1px solid #273248;background:#0f172a;color:#e5e7eb;cursor:pointer">
          New Game
        </button>
      </div>
      <div id="__l2r_grid"></div>
    `;
        document.documentElement.appendChild(container);
    }

    // Show/hide
    btn.addEventListener('click', () => {
        container.style.display = container.style.display === 'none' ? '' : 'none';
    });

    // Game state
    const game = new Chess();
    const grid = container.querySelector('#__l2r_grid');
    const newBtn = container.querySelector('#__l2r_chess_new');

    // Serenity side selector
    const hdr = container.querySelector('#__l2r_chess_header');
    let serenitySide = 'black'; // default: you start as White
    if (hdr && !hdr.querySelector('#__l2r_side')) {
        const sel = document.createElement('select');
        sel.id = '__l2r_side';
        sel.innerHTML = `<option value="black" selected>Serenity: Black</option>
                     <option value="white">Serenity: White</option>`;
        sel.style.cssText = 'margin-left:8px;background:#0f172a;color:#e5e7eb;border:1px solid #273248;border-radius:6px;padding:2px 6px;';
        sel.addEventListener('change', () => { serenitySide = sel.value; });
        hdr.appendChild(sel);
    }

    let listening = false;
    let selected = null;
    renderBoard(grid, game, selected);

    function mySide() {
        return serenitySide === 'white' ? 'black' : 'white';
    }

    // Click-to-move for YOU (only when it's your turn)
    grid.addEventListener('click', (ev) => {
        const cell = ev.target.closest('.sq');
        if (!cell) return;

        const turn = game.turn() === 'w' ? 'white' : 'black';
        if (turn !== mySide()) return; // not your turn; ignore

        const sq = cell.dataset.square;

        if (!selected) {
            const p = game.get(sq);
            if (p && ((p.color === 'w' && mySide() === 'white') || (p.color === 'b' && mySide() === 'black'))) {
                selected = sq;
                renderBoard(grid, game, selected);
            }
            return;
        }

        // attempt move (promotion defaults to queen)
        const move = game.move({ from: selected, to: sq, promotion: 'q' });
        selected = null;
        renderBoard(grid, game, selected);

        if (move) {
            // Send your move to Serenity
            injectReply(`My move: ${move.san}.`).catch(() => { });
            handleGameEndIfAny('you', move.san);
        }
    });

    newBtn.addEventListener('click', () => {
        game.reset();
        selected = null;
        renderBoard(grid, game, selected);
        listening = true;
    });

    // Listen for Serenity chat and try to apply a move
    async function handleIncomingChat(text) {
        if (!listening) return;

        const sideToMove = game.turn() === 'w' ? 'white' : 'black';
        if (sideToMove !== serenitySide) return; // not Serenity's turn

        // 1) Try a fast local match against the legal move list (UCI + SAN)
        const local = findLegalMoveInText(game, text);
        if (local) {
            let applied = null;
            try {
                if (local.notation === 'uci') {
                    const uci = local.move.toLowerCase();
                    const from = uci.slice(0, 2), to = uci.slice(2, 4);
                    const promo = uci.length >= 5 ? uci[4] : 'q';
                    applied = game.move({ from, to, promotion: promo });
                } else {
                    applied = game.move(local.move); // SAN
                }
            } catch { applied = null; }

            if (applied) {
                renderBoard(grid, game, selected);
                handleGameEndIfAny('serenity', applied.san);
                return; // done
            }
        }

        // 2) Fall back to LLM parsing if no direct legal hit
        const parsed = await extractChessMove({ text, fen: game.fen(), side: serenitySide }).catch(() => null);
        if (!parsed) return;

        let applied = null;
        try {
            if (parsed.notation === 'uci') {
                const uci = parsed.move.toLowerCase().replace(/[^a-h1-8qrbn]/g, '');
                if (uci.length < 4) return;
                const from = uci.slice(0, 2), to = uci.slice(2, 4);
                const promo = uci.length >= 5 ? uci[4] : 'q';
                applied = game.move({ from, to, promotion: promo });
            } else {
                applied = game.move(parsed.move); // SAN
            }
        } catch { applied = null; }

        if (!applied) return;
        renderBoard(grid, game, selected);
        handleGameEndIfAny('serenity', applied.san);
    }


    function handleGameEndIfAny(whoJustMoved, lastSan) {
        if (!game.isGameOver()) return;
        let msg = `Game over. `;
        if (game.isCheckmate()) {
            const winner = whoJustMoved === 'serenity' ? 'Serenity' : 'You';
            msg += `Checkmate — ${winner} win. Final move: ${lastSan}.`;
        } else if (game.isStalemate()) {
            msg += `Stalemate.`;
        } else if (game.isThreefoldRepetition()) {
            msg += `Draw by threefold repetition.`;
        } else if (game.isInsufficientMaterial()) {
            msg += `Draw by insufficient material.`;
        } else if (game.isDraw()) {
            msg += `Draw.`;
        }
        listening = false;
        injectReply(msg).catch(() => { });
    }

    // subscribe to chat text
    bus?.on?.('chat:text', handleIncomingChat);

    // keep overlay above UI wars
    //const keepOnTop = () => { container.style.zIndex = '2147483646'; btn.style.zIndex = '2147483646'; };
    //keepOnTop(); setInterval(keepOnTop, 2000);

    container.style.display = container.style.display === 'none' ? '' : 'none';
}
