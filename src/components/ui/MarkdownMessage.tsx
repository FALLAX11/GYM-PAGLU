import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Match `code`, **bold**, __bold__, *italic*, _italic_
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push(text.slice(lastIdx, match.index));
    }
    const seg = match[0];
    if (seg.startsWith('`') && seg.endsWith('`')) {
      tokens.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 font-mono text-[12px] text-[#C4F82A]"
        >
          {seg.slice(1, -1)}
        </code>
      );
    } else if (
      (seg.startsWith('**') && seg.endsWith('**')) ||
      (seg.startsWith('__') && seg.endsWith('__'))
    ) {
      tokens.push(
        <strong key={key++} className="font-semibold text-white">
          {renderInline(seg.slice(2, -2))}
        </strong>
      );
    } else if (
      (seg.startsWith('*') && seg.endsWith('*')) ||
      (seg.startsWith('_') && seg.endsWith('_'))
    ) {
      tokens.push(
        <em key={key++} className="italic text-zinc-200">
          {seg.slice(1, -1)}
        </em>
      );
    } else {
      tokens.push(seg);
    }
    lastIdx = match.index + seg.length;
  }

  if (lastIdx < text.length) {
    tokens.push(text.slice(lastIdx));
  }

  return tokens;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed);
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

export function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(
        <pre
          key={blockKey++}
          className="p-3 rounded-xl bg-black/45 border border-white/10 overflow-x-auto text-xs font-mono text-zinc-200 leading-relaxed"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={blockKey++} className="border-white/10 my-2" />);
      i++;
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const cls =
        level === 1
          ? 'font-display text-base font-bold text-white pt-1'
          : level === 2
          ? 'font-display text-sm font-bold text-white pt-1'
          : 'text-xs font-semibold uppercase tracking-wide text-[#C4F82A] pt-1';
      blocks.push(
        <div key={blockKey++} className={cls}>
          {renderInline(headingText)}
        </div>
      );
      i++;
      continue;
    }

    // Markdown table
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && !lines[i].trim().startsWith('```')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <div
          key={blockKey++}
          className="overflow-x-auto rounded-xl border border-white/10 bg-black/25 my-1"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04]">
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 font-semibold text-white whitespace-nowrap">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {headers.map((_, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-zinc-200 align-top">
                      {renderInline(row[cIdx] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={blockKey++}
          className="pl-3 border-l-2 border-[#C4F82A]/60 text-zinc-300 italic text-xs sm:text-sm space-y-1"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx}>{renderInline(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={blockKey++} className="list-disc pl-5 space-y-1 text-zinc-100">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={blockKey++} className="list-decimal pl-5 space-y-1 text-zinc-100">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s+|```|[-*+]\s+|\d+\.\s+|>\s?|(-{3,}|\*{3,}|_{3,})$)/.test(lines[i].trim()) &&
      !(
        lines[i].trim().includes('|') &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      )
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(
        <p key={blockKey++} className="leading-relaxed text-zinc-100">
          {renderInline(paraLines.join(' '))}
        </p>
      );
    }
  }

  return <div className="space-y-2.5 text-sm break-words">{blocks}</div>;
}
