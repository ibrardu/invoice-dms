"use client";
export default function PrintButton() {
  return <div className="no-print" style={{ textAlign: "center", margin: "0 0 16px" }}>
    <button onClick={() => window.print()}>Download / Print PDF</button></div>;
}
