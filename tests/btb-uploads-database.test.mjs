import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { btbUploadTables, createBtbDatabase, databaseRows, insertRows, uploadsSchema } from "./helpers/btb-database.mjs";

test("BTB upload SQL preserves genuine profile FKs and isolates browser access", async (t) => {
  const uploader = randomUUID(); const employee = randomUUID(); const foodSafe = randomUUID();
  const db = await createBtbDatabase({ profiles: [
    { id: uploader, restaurant_name: "Between the Buns", role: "staff" },
    { id: foodSafe, restaurant_name: "Another kitchen", role: "manager" },
  ] });
  t.after(() => db.close());
  await db.query("INSERT INTO btb_employees(id,name,role) VALUES ($1,'Verified manager','manager')", [employee]);
  const document = { user_id: uploader, uploaded_by: uploader, restaurant_name: "Between the Buns", doc_type: "other", name: "BTB SOP", file_name: "sop.pdf", file_url: "data:application/pdf;base64,JVBERi0=", btb_created_by: employee, btb_created_by_name: "Verified manager" };
  const promotion = { user_id: uploader, restaurant_name: "Between the Buns", title: "BTB promotion", month: 11, year: 2026, btb_created_by: employee, btb_created_by_name: "Verified manager" };
  const post = { user_id: uploader, restaurant_name: "Between the Buns", day: 0, channel: "Instagram", caption: "BTB post", btb_created_by: employee, btb_created_by_name: "Verified manager" };

  await t.test("employee IDs cannot replace any legacy profile foreign key", async () => {
    await assert.rejects(insertRows(db, "business_documents", [{ ...document, user_id: employee }]), { code: "23503" });
    await assert.rejects(insertRows(db, "business_documents", [{ ...document, uploaded_by: employee }]), { code: "23503" });
    await assert.rejects(insertRows(db, "marketing_promotions", [{ ...promotion, user_id: employee }]), { code: "23503" });
    await assert.rejects(insertRows(db, "social_media_calendar", [{ ...post, user_id: employee }]), { code: "23503" });
    await assert.rejects(insertRows(db, "business_documents", [{ ...document, btb_created_by: uploader }]), { code: "23503" });
    await insertRows(db, "business_documents", [document]);
    await insertRows(db, "marketing_promotions", [promotion]);
    await insertRows(db, "social_media_calendar", [post]);
  });

  await t.test("reapplying the migration retains files and their employee attribution", async () => {
    await db.exec(uploadsSchema);
    for (const table of btbUploadTables) {
      const [row] = await databaseRows(db, table);
      assert.equal(row.user_id, uploader);
      assert.equal(row.btb_created_by, employee);
      assert.equal(row.btb_created_by_name, "Verified manager");
    }
  });

  await t.test("anon is denied and a FoodSafe manager cannot read, delete or forge BTB rows", async () => {
    for (const table of btbUploadTables) {
      await assert.rejects(db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE anon");
        await tx.query(`SELECT id FROM ${table}`);
      }), { code: "42501" });
      await db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE authenticated");
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [foodSafe]);
        assert.equal((await tx.query(`SELECT id FROM ${table}`)).rows.length, 0);
        assert.equal((await tx.query(`DELETE FROM ${table} RETURNING id`)).rows.length, 0);
      });
    }
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE authenticated");
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [foodSafe]);
      await insertRows(tx, "business_documents", [{ ...document, user_id: foodSafe, uploaded_by: foodSafe }]);
    }), { code: "42501" });
  });

  await t.test("FoodSafe keeps authenticated CRUD for its restaurant and server BTB writes work", async () => {
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE authenticated");
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [foodSafe]);
      await insertRows(tx, "business_documents", [{ ...document, restaurant_name: "Another kitchen", user_id: foodSafe, uploaded_by: foodSafe, btb_created_by: null }]);
      assert.equal((await tx.query("SELECT id FROM business_documents")).rows.length, 1);
      assert.equal((await tx.query("DELETE FROM business_documents RETURNING id")).rows.length, 1);
    });
    await db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE service_role");
      await insertRows(tx, "social_media_calendar", [{ ...post, caption: "Server saved" }]);
      assert.equal((await tx.query("SELECT id FROM social_media_calendar")).rows.length, 2);
    });
  });

  await t.test("removing an employee preserves uploaded files and their recorded creator names", async () => {
    await db.query("DELETE FROM btb_employees WHERE id=$1", [employee]);
    for (const table of btbUploadTables) {
      for (const row of await databaseRows(db, table)) {
        assert.equal(row.btb_created_by, null);
        assert.equal(row.btb_created_by_name, "Verified manager");
        assert.equal(row.user_id, uploader);
      }
    }
  });
});
