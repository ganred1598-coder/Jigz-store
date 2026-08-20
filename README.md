# JIGz Store — Cloudflare

ชุดเริ่มต้นสำหรับเว็บไซต์ JIGz บน Cloudflare Workers

## Deploy ผ่าน GitHub

1. อัปโหลดไฟล์ทั้งหมดในชุดนี้ไว้ที่รากของ Repository `Jigz-store`
2. ตั้ง Build command เป็น `npm install`
3. ตั้ง Deploy command เป็น `npx wrangler deploy`
4. Push เข้า branch `main` แล้ว Cloudflare จะ Deploy อัตโนมัติ

ระบบจะผูก D1 ด้วยตัวแปร `DB` และสร้างตารางสินค้า/ประวัติสต็อกให้อัตโนมัติเมื่อเรียก `/api/products` ครั้งแรก

ตรวจการเชื่อมฐานข้อมูลได้ที่ `/api/health` ซึ่งควรตอบ `{"ok":true,"database":"connected"}`
