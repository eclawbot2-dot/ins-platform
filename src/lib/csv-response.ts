import { NextResponse } from "next/server";
import { toCsv, type CsvRow } from "@/lib/csv";

/** Wrap rows as a downloadable CSV response. */
export function csvResponse(filename: string, rows: ReadonlyArray<CsvRow>, columns?: ReadonlyArray<string>): NextResponse {
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
