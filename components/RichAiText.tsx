"use client";

type RichAiTextProps = {
  text: string;
  className?: string;
};

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
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\Psi": "Ψ",
  "\\omega": "ω",
  "\\Omega": "Ω",
  "\\mathbb{R}": "ℝ",
  "\\mathbb{N}": "ℕ",
  "\\mathbb{Z}": "ℤ",
  "\\mathbb{Q}": "ℚ",
  "\\mathbb{C}": "ℂ",
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
  "\\geq": "≥",
  "\\ge": "≥",
  "\\neq": "≠",
  "\\ne": "≠",
  "\\approx": "≈",
  "\\simeq": "≃",
  "\\equiv": "≡",
  "\\sim": "~",
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
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\in": "∈",
  "\\notin": "∉",
  "\\subseteq": "⊆",
  "\\subset": "⊂",
  "\\supseteq": "⊇",
  "\\supset": "⊃",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\emptyset": "∅",
  "\\varnothing": "∅",
  "\\angle": "∠",
  "\\perp": "⊥",
  "\\parallel": "∥",
  "\\rightarrow": "→",
  "\\Rightarrow": "⇒",
  "\\leftarrow": "←",
  "\\Leftarrow": "⇐",
  "\\leftrightarrow": "↔",
  "\\Leftrightarrow": "⇔",
  "\\to": "→",
  "\\mapsto": "↦",
  "\\implies": "⇒",
  "\\iff": "⇔",
  "\\land": "∧",
  "\\lor": "∨",
  "\\neg": "¬",
  "\\cdots": "⋯",
  "\\ldots": "…",
};

const superscriptMap: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};

const subscriptMap: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
};

function convertScript(text: string, map: Record<string, string>) {
  return text
    .split("")
    .map((character) => map[character] ?? character)
    .join("");
}

function stripLatexWrappers(text: string) {
  return text
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\:/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\mathrm\{([^{}]*)\}/g, "$1")
    .replace(/\\operatorname\{([^{}]*)\}/g, "$1");
}

function convertLatexMath(rawText: string) {
  let text = stripLatexWrappers(rawText.trim());

  text = text
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\mathcal\s+([A-Z])/g, (_, letter: string) => {
      return latexSymbolMap[`\\mathcal{${letter}}`] ?? letter;
    })
    .replace(/\\mathbb\s+([A-Z])/g, (_, letter: string) => {
      return latexSymbolMap[`\\mathbb{${letter}}`] ?? letter;
    });

  const sortedSymbols = Object.entries(latexSymbolMap).sort(
    ([left], [right]) => right.length - left.length,
  );

  for (const [latex, symbol] of sortedSymbols) {
    text = text.split(latex).join(symbol);
  }

  text = text
    .replace(/\^\{([^{}]+)\}/g, (_, value: string) =>
      convertScript(value, superscriptMap),
    )
    .replace(/\^([A-Za-z0-9+\-=()])/g, (_, value: string) =>
      convertScript(value, superscriptMap),
    )
    .replace(/_\{([^{}]+)\}/g, (_, value: string) =>
      convertScript(value, subscriptMap),
    )
    .replace(/_([A-Za-z0-9+\-=()])/g, (_, value: string) =>
      convertScript(value, subscriptMap),
    )
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function convertPossibleLatexText(text: string) {
  if (!text.includes("\\")) {
    return text;
  }

  return convertLatexMath(text);
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
      return (
        <span
          key={index}
          className="mx-0.5 rounded bg-slate-50 px-1 font-serif text-[1.03em] text-slate-950"
        >
          {convertLatexMath(segment.value)}
        </span>
      );
    }

    return <span key={index}>{convertPossibleLatexText(segment.value)}</span>;
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
    return (
      <div
        key={index}
        className="my-3 overflow-x-auto rounded-md bg-slate-50 px-3 py-2 font-serif text-[1.05em] text-slate-950"
      >
        {convertLatexMath(blockMathMatch[1])}
      </div>
    );
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

export default RichAiText;
