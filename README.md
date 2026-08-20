# JIGz Store — Cloudflare

ชุดเริ่มต้นสำหรับเว็บไซต์ JIGz บน Cloudflare Workers

## Deploy ผ่าน GitHub

1. อัปโหลดไฟล์ทั้งหมดในชุดนี้ไว้ที่รากของ Repository `Jigz-store`
2. ตั้ง Build command เป็น `npm install`
3. ตั้ง Deploy command เป็น `npx wrangler deploy`
4. Push เข้า branch `main` แล้ว Cloudflare จะ Deploy อัตโนมัติ

หน้าเว็บชุดนี้เป็นฐานออนไลน์สำหรับตรวจการ Deploy ก่อนเชื่อมฐานข้อมูล สินค้า ออเดอร์ และระบบแอดมินแบบปลอดภัยในขั้นถัดไป
