"use client";

import type { ReactNode } from "react";

type RichAiTextProps = {
  text: string;
  className?: string;
};

type RichAiInlineTextProps = RichAiTextProps;

type InlineSegment = {
  type: "text" | "bold" | "code" | "math";
  value: string;
};

const latexSymbolMap: Record<string, string> = {
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\Gamma": "Γ",
  "\\delta": "δ",
  "\\Delta": "Δ",
  "\\epsilon": "ε",
  "\\varepsilon": "ε",
  "\\zeta": "ζ",
  "\\eta": "η",
  "\\theta": "θ",
  "\\Theta": "Θ",
  "\\vartheta": "ϑ",
  "\\iota": "ι",
  "\\kappa": "κ",
  "\\lambda": "λ",
  "\\Lambda": "Λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\Xi": "Ξ",
  "\\pi": "π",
  "\\Pi": "Π",
  "\\rho": "ρ",
  "\\varrho": "ϱ",
  "\\sigma": "σ",
  "\\Sigma": "Σ",
  "\\tau": "τ",
  "\\upsilon": "υ",
  "\\Upsilon": "Υ",
  "\\phi": "φ",
  "\\Phi": "Φ",
  "\\varphi": "φ",
  "\\varpi": "ϖ",
  "\\varsigma": "ς",
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\Psi": "Ψ",
  "\\omega": "ω",
  "\\Omega": "Ω",
  "\\ell": "ℓ",
  "\\hbar": "ℏ",
  "\\aleph": "ℵ",
  "\\beth": "ℶ",
  "\\gimel": "ℷ",
  "\\daleth": "ℸ",
  "\\Re": "ℜ",
  "\\Im": "ℑ",
  "\\wp": "℘",
  "\\mathbb{A}": "𝔸",
  "\\mathbb{B}": "𝔹",
  "\\mathbb{R}": "ℝ",
  "\\mathbb{N}": "ℕ",
  "\\mathbb{Z}": "ℤ",
  "\\mathbb{Q}": "ℚ",
  "\\mathbb{C}": "ℂ",
  "\\mathbb{D}": "𝔻",
  "\\mathbb{E}": "𝔼",
  "\\mathbb{F}": "𝔽",
  "\\mathbb{G}": "𝔾",
  "\\mathbb{H}": "ℍ",
  "\\mathbb{I}": "𝕀",
  "\\mathbb{J}": "𝕁",
  "\\mathbb{K}": "𝕂",
  "\\mathbb{L}": "𝕃",
  "\\mathbb{M}": "𝕄",
  "\\mathbb{O}": "𝕆",
  "\\mathbb{P}": "ℙ",
  "\\mathbb{S}": "𝕊",
  "\\mathbb{T}": "𝕋",
  "\\mathbb{U}": "𝕌",
  "\\mathbb{V}": "𝕍",
  "\\mathbb{W}": "𝕎",
  "\\mathbb{X}": "𝕏",
  "\\mathbb{Y}": "𝕐",
  "\\mathbb{0}": "𝟘",
  "\\mathbb{1}": "𝟙",
  "\\mathbb{2}": "𝟚",
  "\\mathbb{3}": "𝟛",
  "\\mathbb{4}": "𝟜",
  "\\mathbb{5}": "𝟝",
  "\\mathbb{6}": "𝟞",
  "\\mathbb{7}": "𝟟",
  "\\mathbb{8}": "𝟠",
  "\\mathbb{9}": "𝟡",
  "\\mathbbm{1}": "𝟙",
  "\\mathds{1}": "𝟙",
  "\\mathcal{A}": "𝒜",
  "\\mathcal{B}": "ℬ",
  "\\mathcal{C}": "𝒞",
  "\\mathcal{D}": "𝒟",
  "\\mathcal{E}": "ℰ",
  "\\mathcal{F}": "ℱ",
  "\\mathcal{G}": "𝒢",
  "\\mathcal{H}": "ℋ",
  "\\mathcal{I}": "ℐ",
  "\\mathcal{J}": "𝒥",
  "\\mathcal{K}": "𝒦",
  "\\mathcal{L}": "ℒ",
  "\\mathcal{M}": "ℳ",
  "\\mathcal{N}": "𝒩",
  "\\mathcal{O}": "𝒪",
  "\\mathcal{P}": "𝒫",
  "\\mathcal{Q}": "𝒬",
  "\\mathcal{R}": "ℛ",
  "\\mathcal{S}": "𝒮",
  "\\mathcal{T}": "𝒯",
  "\\mathcal{U}": "𝒰",
  "\\mathcal{V}": "𝒱",
  "\\mathcal{W}": "𝒲",
  "\\mathcal{X}": "𝒳",
  "\\mathcal{Y}": "𝒴",
  "\\mathcal{Z}": "𝒵",
  "\\leq": "≤",
  "\\le": "≤",
  "\\leqq": "≦",
  "\\geq": "≥",
  "\\ge": "≥",
  "\\geqq": "≧",
  "\\neq": "≠",
  "\\ne": "≠",
  "\\nleq": "≰",
  "\\ngeq": "≱",
  "\\approx": "≈",
  "\\cong": "≅",
  "\\simeq": "≃",
  "\\equiv": "≡",
  "\\asymp": "≍",
  "\\doteq": "≐",
  "\\sim": "~",
  "\\lesssim": "≲",
  "\\gtrsim": "≳",
  "\\ll": "≪",
  "\\gg": "≫",
  "\\prec": "≺",
  "\\succ": "≻",
  "\\preceq": "≼",
  "\\succeq": "≽",
  "\\models": "⊨",
  "\\vdash": "⊢",
  "\\dashv": "⊣",
  "\\bowtie": "⋈",
  "\\lt": "<",
  "\\gt": ">",
  "\\propto": "∝",
  "\\infty": "∞",
  "\\times": "×",
  "\\cdot": "·",
  "\\div": "÷",
  "\\pm": "±",
  "\\mp": "∓",
  "\\sqrt": "√",
  "\\sum": "∑",
  "\\prod": "∏",
  "\\int": "∫",
  "\\iint": "∬",
  "\\iiint": "∭",
  "\\oint": "∮",
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\in": "∈",
  "\\notin": "∉",
  "\\ni": "∋",
  "\\subseteq": "⊆",
  "\\subset": "⊂",
  "\\supseteq": "⊇",
  "\\supset": "⊃",
  "\\subsetneq": "⊊",
  "\\supsetneq": "⊋",
  "\\nsubseteq": "⊈",
  "\\nsupseteq": "⊉",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\setminus": "∖",
  "\\backslash": "\\",
  "\\mid": "|",
  "\\nmid": "∤",
  "\\emptyset": "∅",
  "\\varnothing": "∅",
  "\\angle": "∠",
  "\\perp": "⊥",
  "\\parallel": "∥",
  "\\nparallel": "∦",
  "\\langle": "⟨",
  "\\rangle": "⟩",
  "\\lceil": "⌈",
  "\\rceil": "⌉",
  "\\lfloor": "⌊",
  "\\rfloor": "⌋",
  "\\rightarrow": "→",
  "\\Rightarrow": "⇒",
  "\\leftarrow": "←",
  "\\Leftarrow": "⇐",
  "\\leftrightarrow": "↔",
  "\\Leftrightarrow": "⇔",
  "\\longrightarrow": "⟶",
  "\\Longrightarrow": "⟹",
  "\\longleftarrow": "⟵",
  "\\Longleftarrow": "⟸",
  "\\longleftrightarrow": "⟷",
  "\\Longleftrightarrow": "⟺",
  "\\uparrow": "↑",
  "\\Uparrow": "⇑",
  "\\downarrow": "↓",
  "\\Downarrow": "⇓",
  "\\updownarrow": "↕",
  "\\Updownarrow": "⇕",
  "\\nearrow": "↗",
  "\\searrow": "↘",
  "\\swarrow": "↙",
  "\\nwarrow": "↖",
  "\\hookrightarrow": "↪",
  "\\hookleftarrow": "↩",
  "\\rightharpoonup": "⇀",
  "\\rightharpoondown": "⇁",
  "\\leftharpoonup": "↼",
  "\\leftharpoondown": "↽",
  "\\to": "→",
  "\\mapsto": "↦",
  "\\implies": "⇒",
  "\\iff": "⇔",
  "\\land": "∧",
  "\\wedge": "∧",
  "\\lor": "∨",
  "\\vee": "∨",
  "\\neg": "¬",
  "\\oplus": "⊕",
  "\\ominus": "⊖",
  "\\otimes": "⊗",
  "\\oslash": "⊘",
  "\\odot": "⊙",
  "\\bigoplus": "⨁",
  "\\bigotimes": "⨂",
  "\\circ": "∘",
  "\\bullet": "∙",
  "\\star": "⋆",
  "\\ast": "∗",
  "\\triangle": "△",
  "\\Box": "□",
  "\\square": "□",
  "\\Diamond": "◇",
  "\\therefore": "∴",
  "\\because": "∵",
  "\\degree": "°",
  "\\prime": "′",
  "\\doubleprime": "″",
  "\\dots": "…",
  "\\cdots": "⋯",
  "\\ldots": "…",
  "\\vdots": "⋮",
  "\\ddots": "⋱",
};

const latexFunctionCommands = new Set([
  "\\arg",
  "\\argmax",
  "\\argmin",
  "\\cos",
  "\\cot",
  "\\csc",
  "\\det",
  "\\dim",
  "\\exp",
  "\\gcd",
  "\\inf",
  "\\ker",
  "\\lim",
  "\\ln",
  "\\log",
  "\\max",
  "\\min",
  "\\Pr",
  "\\sec",
  "\\sin",
  "\\sup",
  "\\tan",
  "\\Var",
  "\\Cov",
  "\\E",
]);

const latexSpacingCommands = new Set([
  "\\,",
  "\\:",
  "\\;",
  "\\ ",
  "\\quad",
  "\\qquad",
  "\\enspace",
  "\\thinspace",
  "\\medspace",
  "\\thickspace",
]);

const latexNoopCommands = new Set([
  "\\!",
  "\\displaystyle",
  "\\textstyle",
  "\\scriptstyle",
  "\\scriptscriptstyle",
  "\\limits",
  "\\nolimits",
  "\\left",
  "\\right",
  "\\big",
  "\\bigl",
  "\\bigr",
  "\\bigm",
  "\\Big",
  "\\Bigl",
  "\\Bigr",
  "\\Bigm",
  "\\bigg",
  "\\biggl",
  "\\biggr",
  "\\biggm",
  "\\Bigg",
  "\\Biggl",
  "\\Biggr",
  "\\Biggm",
]);

const latexTextCommands = new Set([
  "\\text",
  "\\textrm",
  "\\textnormal",
  "\\mathrm",
  "\\operatorname",
]);

const latexStyleCommands = new Set([
  "\\mathbf",
  "\\boldsymbol",
  "\\emph",
  "\\mathit",
  "\\mathnormal",
  "\\mathsf",
  "\\mathtt",
  "\\mathfrak",
  "\\textbf",
  "\\textit",
  "\\bold",
]);

const latexAccentMarks: Record<string, { mark?: string; border?: "top" | "bottom" }> = {
  "\\bar": { border: "top" },
  "\\overline": { border: "top" },
  "\\underline": { border: "bottom" },
  "\\vec": { mark: "→" },
  "\\overrightarrow": { mark: "→" },
  "\\hat": { mark: "^" },
  "\\widehat": { mark: "^" },
  "\\tilde": { mark: "~" },
  "\\widetilde": { mark: "~" },
  "\\dot": { mark: "·" },
  "\\ddot": { mark: "··" },
  "\\check": { mark: "ˇ" },
  "\\breve": { mark: "˘" },
  "\\acute": { mark: "´" },
  "\\grave": { mark: "`" },
};

const latexNegatedSymbolMap: Record<string, string> = {
  "\\in": "∉",
  "\\ni": "∌",
  "\\subset": "⊄",
  "\\subseteq": "⊈",
  "\\supset": "⊅",
  "\\supseteq": "⊉",
  "\\equiv": "≢",
  "\\approx": "≉",
  "\\cong": "≇",
  "\\sim": "≁",
  "\\lt": "≮",
  "\\le": "≰",
  "\\leq": "≰",
  "\\gt": "≯",
  "\\ge": "≱",
  "\\geq": "≱",
  "\\mid": "∤",
  "\\parallel": "∦",
};

const latexNegatedCharacterMap: Record<string, string> = {
  "=": "≠",
  "<": "≮",
  ">": "≯",
};

const latexEnvironmentDelimiters: Record<string, { open: string; close: string }> = {
  cases: { open: "{ ", close: "" },
  matrix: { open: "", close: "" },
  smallmatrix: { open: "", close: "" },
  pmatrix: { open: "(", close: ")" },
  bmatrix: { open: "[", close: "]" },
  Bmatrix: { open: "{", close: "}" },
  vmatrix: { open: "|", close: "|" },
  Vmatrix: { open: "‖", close: "‖" },
  array: { open: "", close: "" },
};

const namedHtmlEntityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  quot: '"',
  nbsp: " ",
  lt: "<",
  gt: ">",
  Alpha: "Α",
  Beta: "Β",
  Gamma: "Γ",
  Delta: "Δ",
  Epsilon: "Ε",
  Zeta: "Ζ",
  Eta: "Η",
  Theta: "Θ",
  Iota: "Ι",
  Kappa: "Κ",
  Lambda: "Λ",
  Mu: "Μ",
  Nu: "Ν",
  Xi: "Ξ",
  Omicron: "Ο",
  Pi: "Π",
  Rho: "Ρ",
  Sigma: "Σ",
  Tau: "Τ",
  Upsilon: "Υ",
  Phi: "Φ",
  Chi: "Χ",
  Psi: "Ψ",
  Omega: "Ω",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  le: "≤",
  ge: "≥",
  ne: "≠",
  asymp: "≈",
  approx: "≈",
  equiv: "≡",
  times: "×",
  divide: "÷",
  plusmn: "±",
  minus: "−",
  infin: "∞",
  sum: "∑",
  prod: "∏",
  int: "∫",
  part: "∂",
  nabla: "∇",
  forall: "∀",
  exist: "∃",
  exists: "∃",
  isin: "∈",
  notin: "∉",
  sub: "⊂",
  sup: "⊃",
  sube: "⊆",
  supe: "⊇",
  cup: "∪",
  cap: "∩",
  empty: "∅",
  rarr: "→",
  larr: "←",
  harr: "↔",
  rArr: "⇒",
  lArr: "⇐",
  hArr: "⇔",
  deg: "°",
  prime: "′",
  Prime: "″",
  micro: "μ",
};

type LatexReadResult = {
  value: string;
  end: number;
};

function decodeHtmlCodePoint(codePoint: number, fallback: string) {
  return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : fallback;
}

function decodeCommonHtmlEntities(text: string) {
  return text.replace(
    /&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g,
    (entity, body: string) => {
      if (body.startsWith("#x")) {
        return decodeHtmlCodePoint(Number.parseInt(body.slice(2), 16), entity);
      }

      if (body.startsWith("#")) {
        return decodeHtmlCodePoint(Number.parseInt(body.slice(1), 10), entity);
      }

      return namedHtmlEntityMap[body] ?? entity;
    },
  );
}

function stripLatexWrappers(text: string) {
  return text
    .replace(/\\(?:left|right)\./g, "")
    .replace(/\\left(?![A-Za-z])/g, "")
    .replace(/\\right(?![A-Za-z])/g, "")
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits)\b/g, "")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\:/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\textrm\{([^{}]*)\}/g, "$1")
    .replace(/\\textnormal\{([^{}]*)\}/g, "$1")
    .replace(/\\mathrm\{([^{}]*)\}/g, "$1")
    .replace(/\\operatorname\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:mathbf|boldsymbol|emph|mathit|mathnormal|mathsf|mathtt|mathfrak|textbf|textit)\{([^{}]*)\}/g, "$1");
}

function skipLatexWhitespace(text: string, start: number) {
  let cursor = start;

  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }

  return cursor;
}

function readBalancedLatexGroup(
  text: string,
  start: number,
): LatexReadResult | null {
  if (text[start] !== "{") {
    return null;
  }

  let depth = 1;
  let cursor = start + 1;

  while (cursor < text.length) {
    const character = text[cursor];

    if (character === "\\") {
      cursor += 2;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          value: text.slice(start + 1, cursor),
          end: cursor + 1,
        };
      }
    }

    cursor += 1;
  }

  return null;
}

function readBracketLatexGroup(
  text: string,
  start: number,
): LatexReadResult | null {
  if (text[start] !== "[") {
    return null;
  }

  let depth = 1;
  let cursor = start + 1;

  while (cursor < text.length) {
    const character = text[cursor];

    if (character === "\\") {
      cursor += 2;
      continue;
    }

    if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;

      if (depth === 0) {
        return {
          value: text.slice(start + 1, cursor),
          end: cursor + 1,
        };
      }
    }

    cursor += 1;
  }

  return null;
}

function readLatexAtom(text: string, start: number): LatexReadResult {
  const cursor = skipLatexWhitespace(text, start);

  if (cursor >= text.length) {
    return { value: "", end: cursor };
  }

  if (text[cursor] === "{") {
    const group = readBalancedLatexGroup(text, cursor);

    if (group) {
      return group;
    }
  }

  if (text[cursor] === "\\") {
    const commandMatch = text.slice(cursor).match(/^\\[A-Za-z]+/);

    if (commandMatch) {
      return {
        value: commandMatch[0],
        end: cursor + commandMatch[0].length,
      };
    }

    return {
      value: text.slice(cursor, Math.min(cursor + 2, text.length)),
      end: Math.min(cursor + 2, text.length),
    };
  }

  return {
    value: text[cursor],
    end: cursor + 1,
  };
}

function normalizeLatexForRender(rawText: string) {
  return stripLatexWrappers(decodeCommonHtmlEntities(rawText).trim())
    .replace(/\\begin\{(?:aligned|align\*?|equation\*?|gather\*?|split)\}/g, "")
    .replace(/\\end\{(?:aligned|align\*?|equation\*?|gather\*?|split)\}/g, "")
    .replace(/\s*&\s*/g, " ")
    .replace(/[ \t]+/g, " ");
}

function renderLatexNodes(
  rawText: string,
  keyPrefix: string,
  display = false,
): ReactNode[] {
  const text = normalizeLatexForRender(rawText);
  const nodes: ReactNode[] = [];
  let textBuffer = "";
  let cursor = 0;
  let nodeIndex = 0;

  const nextKey = () => `${keyPrefix}-${nodeIndex}`;

  const pushText = (value: string) => {
    textBuffer += value;
  };

  const flushText = () => {
    if (textBuffer) {
      nodes.push(textBuffer);
      textBuffer = "";
    }
  };

  const pushElement = (node: ReactNode) => {
    flushText();
    nodes.push(node);
    nodeIndex += 1;
  };

  while (cursor < text.length) {
    const character = text[cursor];

    if (character === "{") {
      const group = readBalancedLatexGroup(text, cursor);

      if (group) {
        flushText();
        nodes.push(
          ...renderLatexNodes(group.value, `${nextKey()}-group`, display),
        );
        nodeIndex += 1;
        cursor = group.end;
        continue;
      }
    }

    if (character === "^" || character === "_") {
      const script = readLatexAtom(text, cursor + 1);

      if (script.value) {
        const scriptKey = nextKey();
        const scriptContent = renderLatexNodes(
          script.value,
          `${scriptKey}-script`,
          display,
        );

        if (character === "^") {
          pushElement(
            <sup
              key={scriptKey}
              className="align-super text-[0.7em] leading-none"
            >
              {scriptContent}
            </sup>,
          );
        } else {
          pushElement(
            <sub key={scriptKey} className="align-sub text-[0.7em] leading-none">
              {scriptContent}
            </sub>,
          );
        }

        cursor = script.end;
        continue;
      }
    }

    if (character === "\\") {
      if (text.startsWith("\\\\", cursor)) {
        if (display) {
          pushElement(<br key={nextKey()} />);
        } else {
          pushText(" ");
        }

        cursor += 2;
        continue;
      }

      const commandMatch = text.slice(cursor).match(/^\\[A-Za-z]+/);

      if (commandMatch) {
        const command = commandMatch[0];
        let nextCursor = cursor + command.length;

        if (latexSpacingCommands.has(command)) {
          pushText(
            command === "\\qquad" ? "    " : command === "\\," ? " " : "  ",
          );
          cursor = nextCursor;
          continue;
        }

        if (latexNoopCommands.has(command)) {
          cursor = nextCursor;
          continue;
        }

        if (command === "\\not") {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const nextCommandMatch = text.slice(nextCursor).match(/^\\[A-Za-z]+/);

          if (nextCommandMatch) {
            const nextCommand = nextCommandMatch[0];
            const negatedSymbol = latexNegatedSymbolMap[nextCommand];

            if (negatedSymbol) {
              pushText(negatedSymbol);
              cursor = nextCursor + nextCommand.length;
              continue;
            }
          }

          const negatedCharacter = latexNegatedCharacterMap[text[nextCursor]];

          if (negatedCharacter) {
            pushText(negatedCharacter);
            cursor = nextCursor + 1;
            continue;
          }

          pushText("¬");
          cursor = nextCursor;
          continue;
        }

        if (
          command === "\\frac" ||
          command === "\\dfrac" ||
          command === "\\tfrac"
        ) {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const numerator = readBalancedLatexGroup(text, nextCursor);

          if (numerator) {
            nextCursor = skipLatexWhitespace(text, numerator.end);
            const denominator = readBalancedLatexGroup(text, nextCursor);

            if (denominator) {
              const fractionKey = nextKey();

              pushElement(
                <span
                  key={fractionKey}
                  className="mx-0.5 inline-flex flex-col items-center align-middle text-[0.95em] leading-tight"
                >
                  <span className="px-1 pb-0.5 text-center">
                    {renderLatexNodes(
                      numerator.value,
                      `${fractionKey}-numerator`,
                      display,
                    )}
                  </span>
                  <span className="min-w-full border-t border-slate-700 px-1 pt-0.5 text-center">
                    {renderLatexNodes(
                      denominator.value,
                      `${fractionKey}-denominator`,
                      display,
                    )}
                  </span>
                </span>,
              );
              cursor = denominator.end;
              continue;
            }
          }
        }

        if (command === "\\sqrt") {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const rootIndex = readBracketLatexGroup(text, nextCursor);

          if (rootIndex) {
            nextCursor = skipLatexWhitespace(text, rootIndex.end);
          }

          const radicand =
            readBalancedLatexGroup(text, nextCursor) ||
            readLatexAtom(text, nextCursor);

          if (radicand.value) {
            const sqrtKey = nextKey();

            pushElement(
              <span
                key={sqrtKey}
                className="mx-0.5 inline-flex items-start align-middle leading-tight"
              >
                {rootIndex && (
                  <sup className="mr-0.5 text-[0.62em] leading-none">
                    {renderLatexNodes(
                      rootIndex.value,
                      `${sqrtKey}-index`,
                      display,
                    )}
                  </sup>
                )}
                <span className="text-[1.2em] leading-none">√</span>
                <span className="border-t border-slate-700 px-0.5">
                  {renderLatexNodes(
                    radicand.value,
                    `${sqrtKey}-radicand`,
                    display,
                  )}
                </span>
              </span>,
            );
            cursor = radicand.end;
            continue;
          }
        }

        if (command === "\\binom") {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const numerator = readBalancedLatexGroup(text, nextCursor);

          if (numerator) {
            nextCursor = skipLatexWhitespace(text, numerator.end);
            const denominator = readBalancedLatexGroup(text, nextCursor);

            if (denominator) {
              const binomKey = nextKey();

              pushElement(
                <span
                  key={binomKey}
                  className="mx-0.5 inline-flex items-center align-middle"
                >
                  <span className="text-[1.35em] leading-none">(</span>
                  <span className="inline-flex flex-col items-center text-[0.9em] leading-tight">
                    <span>
                      {renderLatexNodes(
                        numerator.value,
                        `${binomKey}-top`,
                        display,
                      )}
                    </span>
                    <span>
                      {renderLatexNodes(
                        denominator.value,
                        `${binomKey}-bottom`,
                        display,
                      )}
                    </span>
                  </span>
                  <span className="text-[1.35em] leading-none">)</span>
                </span>,
              );
              cursor = denominator.end;
              continue;
            }
          }
        }

        if (command === "\\overset" || command === "\\underset") {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const annotation =
            readBalancedLatexGroup(text, nextCursor) ||
            readLatexAtom(text, nextCursor);

          if (annotation.value) {
            nextCursor = skipLatexWhitespace(text, annotation.end);
            const base =
              readBalancedLatexGroup(text, nextCursor) ||
              readLatexAtom(text, nextCursor);

            if (base.value) {
              const stackKey = nextKey();
              const annotationNode = (
                <span className="text-[0.68em] leading-none">
                  {renderLatexNodes(
                    annotation.value,
                    `${stackKey}-annotation`,
                    display,
                  )}
                </span>
              );
              const baseNode = (
                <span>
                  {renderLatexNodes(base.value, `${stackKey}-base`, display)}
                </span>
              );

              pushElement(
                <span
                  key={stackKey}
                  className="mx-0.5 inline-flex flex-col items-center align-middle leading-tight"
                >
                  {command === "\\overset" ? annotationNode : baseNode}
                  {command === "\\overset" ? baseNode : annotationNode}
                </span>,
              );
              cursor = base.end;
              continue;
            }
          }
        }

        if (latexTextCommands.has(command)) {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          if (text[nextCursor] === "*") {
            nextCursor = skipLatexWhitespace(text, nextCursor + 1);
          }

          const argument = readLatexAtom(text, nextCursor);

          if (argument.value) {
            const textKey = nextKey();
            pushElement(
              <span key={textKey} className="font-sans">
                {renderLatexNodes(
                  argument.value,
                  `${textKey}-text`,
                  display,
                )}
              </span>,
            );
            cursor = argument.end;
            continue;
          }
        }

        if (latexStyleCommands.has(command)) {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const argument = readLatexAtom(text, nextCursor);

          if (argument.value) {
            const styleKey = nextKey();
            const content = renderLatexNodes(
              argument.value,
              `${styleKey}-style`,
              display,
            );

            if (
              command === "\\mathbf" ||
              command === "\\boldsymbol" ||
              command === "\\textbf" ||
              command === "\\bold"
            ) {
              pushElement(
                <strong key={styleKey} className="font-semibold">
                  {content}
                </strong>,
              );
            } else if (command === "\\emph" || command === "\\textit") {
              pushElement(
                <em key={styleKey} className="italic">
                  {content}
                </em>,
              );
            } else {
              pushElement(<span key={styleKey}>{content}</span>);
            }
            cursor = argument.end;
            continue;
          }
        }

        if (
          command === "\\mathbb" ||
          command === "\\mathbbm" ||
          command === "\\mathds" ||
          command === "\\mathcal"
        ) {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const argument = readLatexAtom(text, nextCursor);

          if (argument.value) {
            const value = argument.value.trim();
            const normalizedCommand =
              command === "\\mathbbm" || command === "\\mathds"
                ? "\\mathbb"
                : command;
            const symbol =
              latexSymbolMap[`${command}{${value}}`] ??
              latexSymbolMap[`${normalizedCommand}{${value}}`];
            pushText(symbol ?? value);
            cursor = argument.end;
            continue;
          }
        }

        if (command === "\\begin" || command === "\\end") {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const group = readBalancedLatexGroup(text, nextCursor);

          if (group) {
            const environment = group.value.trim();
            const delimiter = latexEnvironmentDelimiters[environment];
            let endCursor = group.end;

            if (command === "\\begin" && environment === "array") {
              const layout = readBalancedLatexGroup(
                text,
                skipLatexWhitespace(text, endCursor),
              );
              endCursor = layout?.end ?? endCursor;
            }

            pushText(
              command === "\\begin"
                ? delimiter?.open ?? ""
                : delimiter?.close ?? "",
            );
            cursor = endCursor;
            continue;
          }
        }

        if (latexAccentMarks[command]) {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const argument = readLatexAtom(text, nextCursor);

          if (argument.value) {
            const accentKey = nextKey();
            const accent = latexAccentMarks[command];

            pushElement(
              <span
                key={accentKey}
                className={`relative inline-block px-0.5 ${
                  accent.border === "top"
                    ? "border-t border-slate-700"
                    : accent.border === "bottom"
                      ? "border-b border-slate-700"
                      : "pt-1"
                }`}
              >
                {accent.mark && (
                  <span className="absolute -top-1 left-0 right-0 text-center text-[0.75em] leading-none">
                    {accent.mark}
                  </span>
                )}
                {renderLatexNodes(
                  argument.value,
                  `${accentKey}-accent`,
                  display,
                )}
              </span>,
            );
            cursor = argument.end;
            continue;
          }
        }

        if (latexSymbolMap[command]) {
          pushText(latexSymbolMap[command]);
          cursor = nextCursor;
          continue;
        }

        if (latexFunctionCommands.has(command)) {
          pushElement(
            <span key={nextKey()} className="font-sans">
              {command.slice(1)}
            </span>,
          );
          cursor = nextCursor;
          continue;
        }

        pushText(command.slice(1));
        cursor = nextCursor;
        continue;
      }

      const shortCommand = text.slice(cursor, Math.min(cursor + 2, text.length));

      if (shortCommand === "\\," || shortCommand === "\\;" || shortCommand === "\\:") {
        pushText(" ");
      } else if (shortCommand === "\\!") {
        pushText("");
      } else if (latexSymbolMap[shortCommand]) {
        pushText(latexSymbolMap[shortCommand]);
      } else {
        pushText(shortCommand[1] ?? "");
      }

      cursor += shortCommand.length;
      continue;
    }

    pushText(character);
    cursor += 1;
  }

  flushText();

  return nodes;
}

function renderMathExpression(
  rawText: string,
  display = false,
  key?: string | number,
) {
  const content = renderLatexNodes(rawText, `math-${key ?? "value"}`, display);

  if (display) {
    return (
      <div
        key={key}
        className="my-3 overflow-x-auto rounded-md bg-slate-50 px-3 py-2 font-serif text-[1.05em] leading-8 text-slate-950"
      >
        {content}
      </div>
    );
  }

  return (
    <span
      key={key}
      className="mx-0.5 inline-flex max-w-full items-baseline gap-0.5 overflow-x-auto rounded bg-slate-50 px-1 font-serif text-[1.03em] text-slate-950 align-baseline"
    >
      {content}
    </span>
  );
}

function renderTextSegment(text: string, key: string | number) {
  const decodedText = decodeCommonHtmlEntities(text);

  if (!decodedText.includes("\\")) {
    return decodedText;
  }

  return renderLatexNodes(decodedText, `inline-text-${key}`, false);
}

function findClosingDelimiter(text: string, start: number, delimiter: string) {
  const closingIndex = text.indexOf(delimiter, start);
  return closingIndex >= 0 ? closingIndex : null;
}

function tokenizeInline(text: string) {
  const segments: InlineSegment[] = [];
  let cursor = 0;

  const pushText = (value: string) => {
    if (value) {
      segments.push({ type: "text", value });
    }
  };

  while (cursor < text.length) {
    const nextSpecial = [
      text.indexOf("\\(", cursor),
      text.indexOf("\\[", cursor),
      text.indexOf("$$", cursor),
      text.indexOf("$", cursor),
      text.indexOf("**", cursor),
      text.indexOf("`", cursor),
    ]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];

    if (nextSpecial === undefined) {
      pushText(text.slice(cursor));
      break;
    }

    if (nextSpecial > cursor) {
      pushText(text.slice(cursor, nextSpecial));
      cursor = nextSpecial;
    }

    if (text.startsWith("\\(", cursor)) {
      const closingIndex = findClosingDelimiter(text, cursor + 2, "\\)");
      if (closingIndex === null) {
        pushText(text.slice(cursor));
        break;
      }
      segments.push({
        type: "math",
        value: text.slice(cursor + 2, closingIndex),
      });
      cursor = closingIndex + 2;
      continue;
    }

    if (text.startsWith("\\[", cursor)) {
      const closingIndex = findClosingDelimiter(text, cursor + 2, "\\]");
      if (closingIndex === null) {
        pushText(text.slice(cursor));
        break;
      }
      segments.push({
        type: "math",
        value: text.slice(cursor + 2, closingIndex),
      });
      cursor = closingIndex + 2;
      continue;
    }

    if (text.startsWith("$$", cursor)) {
      const closingIndex = findClosingDelimiter(text, cursor + 2, "$$");
      if (closingIndex === null) {
        pushText(text.slice(cursor));
        break;
      }
      segments.push({
        type: "math",
        value: text.slice(cursor + 2, closingIndex),
      });
      cursor = closingIndex + 2;
      continue;
    }

    if (text.startsWith("$", cursor)) {
      const closingIndex = findClosingDelimiter(text, cursor + 1, "$");
      if (closingIndex === null) {
        pushText(text[cursor]);
        cursor += 1;
        continue;
      }
      segments.push({
        type: "math",
        value: text.slice(cursor + 1, closingIndex),
      });
      cursor = closingIndex + 1;
      continue;
    }

    if (text.startsWith("**", cursor)) {
      const closingIndex = findClosingDelimiter(text, cursor + 2, "**");
      if (closingIndex === null) {
        pushText(text.slice(cursor));
        break;
      }
      segments.push({
        type: "bold",
        value: text.slice(cursor + 2, closingIndex),
      });
      cursor = closingIndex + 2;
      continue;
    }

    if (text.startsWith("`", cursor)) {
      const closingIndex = findClosingDelimiter(text, cursor + 1, "`");
      if (closingIndex === null) {
        pushText(text[cursor]);
        cursor += 1;
        continue;
      }
      segments.push({
        type: "code",
        value: text.slice(cursor + 1, closingIndex),
      });
      cursor = closingIndex + 1;
      continue;
    }
  }

  return segments;
}

function renderInline(text: string) {
  return tokenizeInline(text).map((segment, index) => {
    if (segment.type === "bold") {
      return (
        <strong key={index} className="font-semibold text-slate-950">
          {renderInline(segment.value)}
        </strong>
      );
    }

    if (segment.type === "code") {
      return (
        <code
          key={index}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.92em] text-slate-800"
        >
          {segment.value}
        </code>
      );
    }

    if (segment.type === "math") {
      return renderMathExpression(segment.value, false, index);
    }

    return <span key={index}>{renderTextSegment(segment.value, index)}</span>;
  });
}

function renderBlock(block: string, index: number) {
  const trimmedBlock = block.trim();

  if (!trimmedBlock) {
    return null;
  }

  const blockMathMatch =
    trimmedBlock.match(/^\\\[([\s\S]*)\\\]$/) ||
    trimmedBlock.match(/^\$\$([\s\S]*)\$\$$/);

  if (blockMathMatch) {
    return renderMathExpression(blockMathMatch[1], true, index);
  }

  const lines = trimmedBlock.split("\n");
  const isBulletList = lines.every((line) => /^\s*[-*]\s+/.test(line));
  const isNumberedList = lines.every((line) => /^\s*\d+[.)]\s+/.test(line));

  if (isBulletList || isNumberedList) {
    const ListTag = isNumberedList ? "ol" : "ul";

    return (
      <ListTag
        key={index}
        className={
          isNumberedList
            ? "my-3 list-decimal space-y-1 pl-5"
            : "my-3 list-disc space-y-1 pl-5"
        }
      >
        {lines.map((line, lineIndex) => (
          <li key={lineIndex}>
            {renderInline(line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""))}
          </li>
        ))}
      </ListTag>
    );
  }

  return (
    <p key={index} className="my-3 leading-7">
      {lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {lineIndex > 0 && <br />}
          {renderInline(line)}
        </span>
      ))}
    </p>
  );
}

export function RichAiText({ text, className = "" }: RichAiTextProps) {
  const blocks = text.split(/\n{2,}/);

  return (
    <div className={`text-slate-800 ${className}`}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

export function RichAiInlineText({
  text,
  className = "",
}: RichAiInlineTextProps) {
  return <span className={className}>{renderInline(text)}</span>;
}

export default RichAiText;
