import type { AcademicPaper } from "@/lib/academic/types";
import type { Workspace } from "./schema";
export function csv(rows: unknown[][]) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let s = String(value ?? "");
            if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function escapeBib(value: string) {
  return value.replace(
    /[\\{}%&#_$~^]/g,
    (c) =>
      ({
        "\\": "\\textbackslash{}",
        "~": "\\textasciitilde{}",
        "^": "\\textasciicircum{}",
      })[c] || "\\" + c,
  );
}
export function bibliography(papers: AcademicPaper[], format: "bib" | "ris") {
  return papers
    .map((p, i) => {
      const link = p.doi ? `https://doi.org/${p.doi}` : p.sourceUrls[0]?.url;
      if (format === "ris")
        return [
          "TY  - " +
            (/conference/i.test(p.paperType || "")
              ? "CONF"
              : /article|review/i.test(p.paperType || "")
                ? "JOUR"
                : "GEN"),
          "TI  - " + p.title,
          ...p.authors.map((a) => "AU  - " + a),
          p.year && "PY  - " + p.year,
          p.venue && "JO  - " + p.venue,
          p.doi && "DO  - " + p.doi,
          link && "UR  - " + link,
          "ER  - ",
        ]
          .filter(Boolean)
          .map((v) => String(v).replace(/[\r\n]/g, " "))
          .join("\r\n");
      const type = /conference/i.test(p.paperType || "")
        ? "inproceedings"
        : /article|review/i.test(p.paperType || "")
          ? "article"
          : "misc";
      return (
        `@${type}{scholar${i + 1},\n` +
        Object.entries({
          title: p.title,
          author: p.authors.join(" and "),
          year: p.year,
          doi: p.doi,
          url: link,
          [type === "inproceedings" ? "booktitle" : "journal"]: p.venue,
        })
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => `  ${k} = {${escapeBib(String(v))}}`)
          .join(",\n") +
        "\n}"
      );
    })
    .join("\n\n");
}
export function evidenceCSV(state: Workspace) {
  return csv([
    [
      "Paper",
      "DOI",
      "Field",
      "Statement",
      "Kind",
      "Supporting passage",
      "Document SHA256",
      "Page",
      "Source URL",
    ],
    ...state.evidence.map((e) => {
      const p = state.papers.find((p) => p.id === e.paperId);
      const d = state.documents.find((d) => d.id === e.documentId);
      return [
        p?.title,
        p?.doi,
        e.field,
        e.statement,
        e.kind,
        e.quote,
        d?.hash,
        e.page,
        p?.sourceUrls[0]?.url,
      ];
    }),
  ]);
}
export function screeningCSV(state: Workspace) {
  const reproCell = (v: boolean | null | undefined) =>
    v === true ? "yes" : v === false ? "no" : "";
  return csv([
    [
      "Project",
      "Paper",
      "Decision",
      "Reason",
      "Reading status",
      "Tags",
      "Notes",
      "Repro code",
      "Repro data",
      "Repro seeds",
      "Repro license",
    ],
    ...state.projects.flatMap((p) =>
      p.members.map((m) => [
        p.name,
        state.papers.find((x) => x.id === m.paperId)?.title,
        m.decision,
        m.reason,
        m.status,
        m.tags,
        m.notes,
        reproCell(m.repro?.code),
        reproCell(m.repro?.data),
        reproCell(m.repro?.seeds),
        m.repro?.license ?? "",
      ]),
    ),
  ]);
}
