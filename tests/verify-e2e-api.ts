import fs from "fs/promises";
import path from "path";
import { verifyC2PAAbsent } from "../lib/c2pa-handler";

async function verifyE2e() {
  console.log("Starting End-to-End API verification against running server on http://localhost:3000 ...");

  const fixturePath = path.join(__dirname, "fixtures", "ai-c2pa-image.jpg");
  const fileBytes = await fs.readFile(fixturePath);

  // 1. Inspect API
  const inspectForm = new FormData();
  inspectForm.append("image", new Blob([fileBytes], { type: "image/jpeg" }), "ai-c2pa-image.jpg");

  const inspectRes = await fetch("http://localhost:3000/api/inspect", {
    method: "POST",
    body: inspectForm,
  });

  if (!inspectRes.ok) {
    throw new Error(`Inspect failed: ${inspectRes.status} ${await inspectRes.text()}`);
  }

  const inspectJson = await inspectRes.json();
  console.log("✓ Inspect API response:");
  console.log("  hasC2pa:", inspectJson.hasC2pa);
  console.log("  claimGenerator:", inspectJson.c2paStatus?.details?.claimGenerator);
  console.log("  warnings:", inspectJson.warnings);

  if (!inspectJson.hasC2pa) {
    throw new Error("Expected C2PA to be detected on ai-c2pa-image.jpg!");
  }

  // 2. Process API with c2paHandling = "remove"
  const processForm = new FormData();
  processForm.append("image", new Blob([fileBytes], { type: "image/jpeg" }), "ai-c2pa-image.jpg");
  processForm.append("options", JSON.stringify({
    c2paHandling: "remove",
    metadataStrategy: "clean_and_apply",
    captureDateMode: "today",
  }));

  const processRes = await fetch("http://localhost:3000/api/process", {
    method: "POST",
    body: processForm,
  });

  if (!processRes.ok) {
    throw new Error(`Process failed: ${processRes.status} ${await processRes.text()}`);
  }

  const c2paHeader = processRes.headers.get("x-c2pa-action");
  const diffHeader = processRes.headers.get("x-metadata-diff");
  const filenameHeader = processRes.headers.get("x-output-filename");

  console.log("\n✓ Process API response:");
  console.log("  x-c2pa-action:", c2paHeader);
  console.log("  x-output-filename:", filenameHeader);

  if (c2paHeader !== "removed") {
    throw new Error(`Expected x-c2pa-action header to be 'removed', got '${c2paHeader}'`);
  }

  if (diffHeader) {
    const diff = JSON.parse(Buffer.from(diffHeader, "base64").toString("utf8"));
    const c2paDiff = diff.find((d: any) => d.field.includes("C2PA"));
    console.log("  C2PA Diff entry:", c2paDiff);
  }

  // 3. Save output and independently verify C2PA is absent
  const outputBuffer = Buffer.from(await processRes.arrayBuffer());
  const tempOut = path.join(__dirname, "fixtures", "e2e_verified_output.png");
  await fs.writeFile(tempOut, outputBuffer);

  const verify = await verifyC2PAAbsent(tempOut);
  console.log("\n✓ Output file C2PA absence verification:", verify.absent ? "CONFIRMED ABSENT" : "FAILED");
  await fs.unlink(tempOut);

  if (!verify.absent) {
    throw new Error("C2PA was still found in output file!");
  }

  console.log("\nEnd-to-End API verification completed with 100% SUCCESS!");
}

verifyE2e().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
