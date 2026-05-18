"use client";

import type { ReactNode } from "react";

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

type LatexReadResult = {
  value: string;
  end: number;
};

function convertScript(text: string, map: Record<string, string>) {
  return text
    .split("")
    .map((character) => map[character] ?? character)
    .join("");
}

function stripLatexWrappers(text: string) {
  return text
    .replace(/\\left(?![A-Za-z])/g, "")
    .replace(/\\right(?![A-Za-z])/g, "")
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
  return stripLatexWrappers(rawText.trim())
    .replace(/\\begin\{(?:aligned|align\*?|equation\*?|gather\*?|split)\}/g, "")
    .replace(/\\end\{(?:aligned|align\*?|equation\*?|gather\*?|split)\}/g, "")
    .replace(/&/g, "")
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

        if (
          command === "\\quad" ||
          command === "\\qquad" ||
          command === "\\enspace"
        ) {
          pushText(command === "\\qquad" ? "    " : "  ");
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

          const radicand = readBalancedLatexGroup(text, nextCursor);

          if (radicand) {
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

        if (
          command === "\\text" ||
          command === "\\mathrm" ||
          command === "\\operatorname"
        ) {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const group = readBalancedLatexGroup(text, nextCursor);

          if (group) {
            pushElement(
              <span key={nextKey()} className="font-sans">
                {group.value}
              </span>,
            );
            cursor = group.end;
            continue;
          }
        }

        if (
          command === "\\mathbf" ||
          command === "\\boldsymbol" ||
          command === "\\emph"
        ) {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const group = readBalancedLatexGroup(text, nextCursor);

          if (group) {
            pushElement(
              <strong key={nextKey()} className="font-semibold">
                {renderLatexNodes(group.value, `${nextKey()}-bold`, display)}
              </strong>,
            );
            cursor = group.end;
            continue;
          }
        }

        if (command === "\\mathbb" || command === "\\mathcal") {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const group = readBalancedLatexGroup(text, nextCursor);

          if (group) {
            const value = group.value.trim();
            const symbol = latexSymbolMap[`${command}{${value}}`];
            pushText(symbol ?? value);
            cursor = group.end;
            continue;
          }
        }

        if (
          command === "\\bar" ||
          command === "\\overline" ||
          command === "\\vec"
        ) {
          nextCursor = skipLatexWhitespace(text, nextCursor);
          const group = readBalancedLatexGroup(text, nextCursor);

          if (group) {
            const accentKey = nextKey();
            const isVector = command === "\\vec";

            pushElement(
              <span
                key={accentKey}
                className={`relative inline-block px-0.5 ${
                  isVector ? "pt-1" : "border-t border-slate-700"
                }`}
              >
                {isVector && (
                  <span className="absolute -top-1 left-0 right-0 text-center text-[0.75em] leading-none">
                    →
                  </span>
                )}
                {renderLatexNodes(group.value, `${accentKey}-accent`, display)}
              </span>,
            );
            cursor = group.end;
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
      return renderMathExpression(segment.value, false, index);
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

export default RichAiText;
