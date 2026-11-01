import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { loadInvoice } from "./invoice-data";

type Loaded = Awaited<ReturnType<typeof loadInvoice>>;
export type PdfData = Pick<Loaded, "inv" | "client" | "items" | "company"> & { balance: number; qr: string | null };
// Server-side PDF of the invoice, mirroring the LaTeX template: A4, 20mm margins, Helvetica 10pt,
// \Large / \LARGE headings, items with totals, #F5F5F5 note box, footer fixed to the bottom of every page.
const mm = (n: number) => n * 2.8346;
const s = StyleSheet.create({
  page: { paddingTop: mm(20), paddingBottom: mm(44), paddingHorizontal: mm(20), fontFamily: "Helvetica", fontSize: 10, color: "#000", lineHeight: 1.25 },
  head: { flexDirection: "row", justifyContent: "space-between" },
  name: { fontFamily: "Helvetica-Bold", fontSize: 14.4 },
  no: { fontFamily: "Helvetica-Bold", fontSize: 17.28, textAlign: "right" },
  small: { fontSize: 9, textAlign: "right", marginTop: mm(2) },
  parties: { flexDirection: "row", marginTop: mm(15) },
  col: { width: "50%" },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 14.4, marginBottom: mm(2) },
  b: { fontFamily: "Helvetica-Bold" },
  h2: { fontFamily: "Helvetica-Bold", fontSize: 14.4, marginTop: mm(15), marginBottom: mm(3) },
  row: { flexDirection: "row", paddingVertical: 4 },
  th: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.4, borderBottomColor: "#000" },
  cDesc: { width: "46%" }, cNum: { width: "13.5%", textAlign: "right" },
  rule: { borderBottomWidth: 0.4, borderBottomColor: "#000" },
  tot: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 4 },
  totL: { width: "40%", textAlign: "right", fontFamily: "Helvetica-Bold", paddingRight: 8 }, totV: { width: "13.5%", textAlign: "right" },
  payRow: { flexDirection: "row", marginTop: mm(10), alignItems: "flex-start" },
  note: { flexGrow: 1, backgroundColor: "#F5F5F5", borderRadius: mm(2), padding: mm(3) },
  qrBox: { width: mm(34), marginLeft: mm(6), alignItems: "center" },
  qrText: { fontSize: 7.5, textAlign: "center", color: "#333", marginTop: 3 },
  foot: { position: "absolute", left: mm(20), right: mm(20), bottom: mm(12), borderTopWidth: 0.8, borderTopColor: "#F5F5F5", paddingTop: mm(5), flexDirection: "row", fontSize: 9 },
  fcol: { width: "33%" }, fcolW: { width: "34%" },
  flabel: { fontFamily: "Helvetica-Bold", color: "#808080", marginBottom: mm(1), fontSize: 9 },
  pageNo: { position: "absolute", bottom: mm(6), left: 0, right: 0, textAlign: "center", fontSize: 8, color: "#808080" },
});

const long = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Pure layout: data in, PDF bytes out. */
export async function renderInvoicePdf({ inv, client, items, company, balance, qr }: PdfData) {
  const sym = new Intl.NumberFormat("en", { style: "currency", currency: inv.currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? inv.currency;
  const m = (c: number) => `${sym} ${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const addr = company.address.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const note = [inv.notes, company.footerNote].filter(Boolean).join("\n");

  const doc = (
    <Document title={`Invoice ${inv.number}`} author={company.name} subject={`Invoice ${inv.number} for ${client.name}`}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          {company.logoUrl ? <Image src={company.logoUrl} style={{ maxHeight: mm(14), maxWidth: mm(70) }} /> : <Text style={s.name}>{company.name.toUpperCase()}</Text>}
          <View><Text style={s.no}>Invoice {inv.number}</Text><Text style={s.small}>Issued on {long(inv.issueDate)}</Text></View>
        </View>

        <View style={s.parties}>
          <View style={s.col}>
            <Text style={s.h3}>Billed to</Text>
            <Text style={s.b}>{client.name.toUpperCase()}</Text>
            {client.email ? <Text>{client.email}</Text> : null}
            <Text>{client.address}</Text>
            {client.taxId ? <Text>VAT: {client.taxId}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.h3}>From</Text>
            <Text style={s.b}>{company.name.toUpperCase()}</Text>
            <Text>{addr.join(", ")}</Text>
            {company.taxId ? <Text>VAT: {company.taxId}</Text> : null}
            <Text style={{ marginTop: mm(2) }}><Text style={s.b}>Date of sale / supply</Text> - {inv.supplyDates || long(inv.issueDate)}</Text>
            <Text><Text style={s.b}>Due date</Text> - {long(inv.dueDate)}</Text>
          </View>
        </View>

        <Text style={s.h2}>Items</Text>
        <View style={s.th} fixed>
          <Text style={[s.cDesc, s.b]}>Name / description</Text><Text style={[s.cNum, s.b]}>Price</Text>
          <Text style={[s.cNum, s.b]}>Quantity</Text><Text style={[s.cNum, s.b]}>Tax rate (%)</Text><Text style={[s.cNum, s.b]}>Amount</Text>
        </View>
        {items.map((it, i) => (
          <View key={it.id} style={[s.row, i === items.length - 1 ? s.rule : {}]} wrap={false}>
            <Text style={s.cDesc}>{it.description}</Text><Text style={s.cNum}>{m(it.unitPriceCents)}</Text>
            <Text style={s.cNum}>{Number(it.quantity)}</Text><Text style={s.cNum}>{Number(it.taxRate)}</Text><Text style={s.cNum}>{m(it.lineTotalCents)}</Text>
          </View>
        ))}
        <View wrap={false}>
          <View style={s.tot}><Text style={s.totL}>Subtotal</Text><Text style={s.totV}>{m(inv.subtotalCents)}</Text></View>
          <View style={s.tot}><Text style={s.totL}>Total Tax</Text><Text style={s.totV}>{m(inv.taxCents)}</Text></View>
          <View style={[s.tot, { borderTopWidth: 0.4, borderTopColor: "#000", marginLeft: "46%" }]}><Text style={[s.totL, { width: "74%" }]}>Total</Text><Text style={[s.totV, { width: "26%" }]}>{m(inv.totalCents)}</Text></View>
        </View>

        {(note || qr) ? (
          <View style={s.payRow} wrap={false}>
            {note ? <View style={s.note}><Text style={[s.b, { marginBottom: mm(3) }]}>Invoice note</Text><Text>{note}</Text></View> : <View style={{ flexGrow: 1 }} />}
            {qr ? <View style={s.qrBox}><Image src={qr} style={{ width: mm(30), height: mm(30) }} /><Text style={s.qrText}>Scan to pay {m(balance)}{"\n"}with your banking app</Text></View> : null}
          </View>
        ) : null}

        <View style={s.foot} fixed>
          <View style={s.fcol}><Text style={s.flabel}>ADDRESS</Text><Text>{company.name.toUpperCase()}</Text>{addr.map((l, i) => <Text key={i}>{l}</Text>)}</View>
          <View style={s.fcol}><Text style={s.flabel}>CONTACT</Text>{company.email ? <Text>{company.email}</Text> : null}{company.phone ? <Text>{company.phone}</Text> : null}</View>
          <View style={s.fcolW}><Text style={s.flabel}>PAYMENT DETAILS</Text>
            {company.bankDetails.split(/\n/).filter(Boolean).map((l, i) => { const [k, ...v] = l.split(":");
              return v.length ? <Text key={i}><Text style={s.b}>{k}:</Text>{v.join(":")}</Text> : <Text key={i}>{l}</Text>; })}</View>
        </View>
        <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => totalPages > 1 ? `${pageNumber} / ${totalPages}` : ""} />
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
