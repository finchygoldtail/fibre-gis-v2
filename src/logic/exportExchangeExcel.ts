import * as XLSX from "xlsx-js-style";

type TemplateColumn = {
  key: string;
  description: string;
  required?: boolean;
  example?: string | number;
};

function buildTemplateWorkbook(title: string, columns: TemplateColumn[]) {
  const headers = columns.map((column) => column.key);
  const example = columns.map((column) => column.example ?? "");
  const guidanceRows = [
    ["Template", title],
    [
      "Required columns",
      columns
        .filter((column) => column.required)
        .map((column) => column.key)
        .join(", "),
    ],
    [],
    ["Column", "Required", "Description", "Example"],
    ...columns.map((column) => [
      column.key,
      column.required ? "Yes" : "No",
      column.description,
      column.example ?? "",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([headers, example]);
  const guidanceSheet = XLSX.utils.aoa_to_sheet(guidanceRows);

  dataSheet["!cols"] = headers.map(() => ({ wch: 26 }));
  guidanceSheet["!cols"] = [
    { wch: 30 },
    { wch: 16 },
    { wch: 70 },
    { wch: 34 },
  ];

  XLSX.utils.book_append_sheet(workbook, dataSheet, "Exchange Template");
  XLSX.utils.book_append_sheet(workbook, guidanceSheet, "Guidance");

  return workbook;
}

export function downloadExchangeTemplate() {
  const columns: TemplateColumn[] = [
    {
      key: "Exchange Name",
      required: true,
      description: "Exchange or headend name as it should appear in Alistra GIS.",
      example: "Baildon Exchange",
    },
    {
      key: "Exchange Code",
      required: true,
      description: "Short exchange code or site reference.",
      example: "BD-BAS-EX01",
    },
    {
      key: "OLT",
      required: true,
      description: "OLT name or number.",
      example: "OLT 1",
    },
    {
      key: "OLT Card",
      required: true,
      description: "OLT line card / LT card number.",
      example: "Card 1",
    },
    {
      key: "PON Port",
      required: true,
      description: "PON port on the OLT card.",
      example: "PON 1/1",
    },
    {
      key: "HD Splitter Panel",
      description: "High density splitter panel name or rack position.",
      example: "HD Splitter Panel 1",
    },
    {
      key: "Splitter Input",
      description: "Splitter input number or reference.",
      example: "Input 1",
    },
    {
      key: "Splitter Ratio",
      description: "Splitter ratio used by this input.",
      example: "1:4",
    },
    {
      key: "Splitter Output",
      description: "Splitter output number.",
      example: "Output 1",
    },
    {
      key: "Feeder Panel",
      description: "Feeder panel name in the exchange.",
      example: "144F Feeder Panel 1",
    },
    {
      key: "Feeder Cable",
      description: "Cable ID leaving the exchange/headend.",
      example: "BD-BAS-FEEDER-001",
    },
    {
      key: "Feeder Fibre",
      description: "Feeder fibre number patched to this splitter output.",
      example: 1,
    },
    {
      key: "Destination Joint/Cab",
      description: "Optional downstream joint, cab or route destination.",
      example: "BD-BAS-AG1-LMJ01",
    },
    {
      key: "Notes",
      description: "Engineer notes, rack references or audit comments.",
      example: "Starter exchange template",
    },
  ];

  XLSX.writeFile(
    buildTemplateWorkbook("Alistra GIS Exchange Blank Template", columns),
    "Alistra_GIS_Exchange_Template.xlsx",
  );
}
