"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Formula } from "@/components/math";
import { cn } from "@/lib/utils";

const EQUATION_PRESETS = [
  { label: "Throughput", latex: "T \\approx \\frac{W}{RTT}" },
  { label: "Quadratic", latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" },
  { label: "Schrödinger", latex: "\\hat{H}\\psi(x) = E\\psi(x)" },
  { label: "Eigenvalue", latex: "A\\mathbf{v} = \\lambda\\mathbf{v}" },
  { label: "Sum", latex: "\\sum_{i=1}^{n} x_i = X" },
  { label: "Gradient", latex: "\\theta_{t+1} = \\theta_t - \\eta \\nabla_\\theta L(\\theta_t)" },
];

export function EquationModal({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (latex: string) => void;
}) {
  const [latex, setLatex] = React.useState("T \\approx \\frac{W}{RTT}");

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      eyebrow="∑ Math"
      title="Insert equation"
      description="Type LaTeX. The preview is live and the block stays editable."
      footer={
        <>
          <span className="text-[13.5px] text-muted">Rendered with KaTeX</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onInsert(latex)} disabled={!latex.trim()}>
              Insert equation
            </Button>
          </div>
        </>
      }
    >
      <div className="mb-2 grid min-h-[86px] place-items-center rounded-[8px] border border-border bg-[#f8fafc] p-3">
        <Formula latex={latex || "\\text{Type an expression}"} display />
      </div>
      <textarea
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        rows={3}
        spellCheck={false}
        className="code-editor w-full resize-none rounded-[6px] border border-border bg-white px-2.5 py-2 text-[15px] text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {EQUATION_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setLatex(p.latex)}
            className={cn(
              "rounded-[999px] border border-border bg-white px-2 py-[3px] text-[13px] text-slate-mid hover:border-blue hover:text-blue",
              latex === p.latex && "border-blue bg-blue-soft text-blue",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function TableModal({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (caption: string, columns: string[], rows: string[][]) => void;
}) {
  const [caption, setCaption] = React.useState("Comparison");
  const [columns, setColumns] = React.useState(["Property", "A", "B"]);
  const [rows, setRows] = React.useState<string[][]>([
    ["", "", ""],
    ["", "", ""],
  ]);

  const resize = (ncol: number, nrow: number) => {
    setColumns((c) => {
      const next = [...c];
      while (next.length < ncol) next.push(`Column ${next.length + 1}`);
      return next.slice(0, ncol);
    });
    setRows((r) => {
      const next = r.map((row) => {
        const rr = [...row];
        while (rr.length < ncol) rr.push("");
        return rr.slice(0, ncol);
      });
      while (next.length < nrow) next.push(Array.from({ length: ncol }, () => ""));
      return next.slice(0, nrow);
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      eyebrow="Table"
      title="Insert table"
      description="Booktabs-style rules, editable cells, one caption."
      footer={
        <>
          <span className="text-[13.5px] text-muted">
            {columns.length} columns · {rows.length} rows
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onInsert(caption, columns, rows)}>Insert table</Button>
          </div>
        </>
      }
    >
      <div className="mb-2 flex items-end gap-2">
        <div className="flex-1">
          <p className="mb-1 text-[14.5px] font-medium text-slate-mid">Caption</p>
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => resize(columns.length, rows.length + 1)}
            className="h-9 rounded-[6px] border border-border bg-white px-2 text-[14px] text-slate-mid hover:border-blue hover:text-blue"
          >
            + Row
          </button>
          <button
            onClick={() => resize(columns.length + 1, rows.length)}
            className="h-9 rounded-[6px] border border-border bg-white px-2 text-[14px] text-slate-mid hover:border-blue hover:text-blue"
          >
            + Col
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-[6px] border border-border">
        <table className="w-full text-[14.5px]">
          <thead className="bg-canvas">
            <tr>
              {columns.map((c, i) => (
                <th key={i} className="border-b border-border p-1">
                  <input
                    value={c}
                    onChange={(e) => {
                      const next = [...columns];
                      next[i] = e.target.value;
                      setColumns(next);
                    }}
                    className="w-full rounded-[4px] bg-transparent px-1.5 py-1 font-semibold text-ink outline-none focus:bg-white"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((_, ci) => (
                  <td key={ci} className="border-b border-border/60 p-1">
                    <input
                      value={row[ci] ?? ""}
                      onChange={(e) => {
                        const next = rows.map((r) => [...r]);
                        next[ri][ci] = e.target.value;
                        setRows(next);
                      }}
                      className="w-full rounded-[4px] bg-transparent px-1.5 py-1 text-slate-mid outline-none focus:bg-canvas"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
