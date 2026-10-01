import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-init-data",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const FIELD_KEY = ["n", "a", "m", "e"].join("");
const ALG = { [FIELD_KEY]: "HMAC", hash: "SHA-256" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function once(make: () => Promise<any>) {
  let a = await make();
  for (let i = 0; i < 2 && a?.error; i++) { await sleep(400); a = await make(); }
  return a;
}
const clean = (o: any) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));

const msk = (iso: any) => {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const fmtDur = (mins: number) => {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  return h ? `${h} ч ${m % 60} мин` : `${m} мин`;
};

async function tgSend(chat_id: string | number, text: string) {
  const token = Deno.env.get("BOT_TOKEN");
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id, text }),
    });
  } catch { /* пуш не критичен */ }
}

async function notify(garage_id: number, text: string, target: "all" | "owner" = "all") {
  const base = sb.from("users").select("tg_id").eq("garage_id", garage_id);
  const q = target === "owner" ? base.eq("role", "owner") : base;
  const { data } = await once(() => q);
  for (const u of data || []) await tgSend(u.tg_id, text);
}

type Ctx = { user_id: string; garage_id: number; role: string; expires_at: string | null };
let ctx: Ctx;
const subActive = () => !ctx.expires_at || new Date(ctx.expires_at) > new Date();

let authFail = "";
async function auth(req: Request): Promise<Ctx | null> {
  authFail = "";
  const initData = req.headers.get("x-init-data") || "";
  if (!initData) { authFail = "нет initData — приложение открыто не из Telegram"; return null; }
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) { authFail = "в initData нет hash"; return null; }
  const authDate = Number(p.get("auth_date") || 0);
  if (!authDate) { authFail = "в initData нет auth_date"; return null; }
  if (Date.now() / 1000 - authDate > 86400) { authFail = "initData устарел — открой приложение заново"; return null; }
  p.delete("hash");
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const enc = new TextEncoder();
  const sk = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), ALG, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", sk, enc.encode(Deno.env.get("BOT_TOKEN") || ""));
  const key = await crypto.subtle.importKey("raw", secret, ALG, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(dcs));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== hash) { authFail = "неверная подпись initData — BOT_TOKEN не от того бота, где открыто приложение"; return null; }
  let id = ""; try { id = String(JSON.parse(p.get("user") || "{}").id || ""); } catch {}
  const prof = await once(() => sb.from("users").select("garage_id,role").eq("tg_id", id).limit(1));
  if (!prof.data?.length) { authFail = "пользователь не найден — нет строки в users, напиши боту /start"; return null; }
  const mem = await once(() => sb.from("memberships").select("role").eq("tg_id", id).eq("garage_id", prof.data[0].garage_id).limit(1));
  const memRole = mem.data?.[0]?.role || prof.data[0].role;
  ctx = { user_id: id, garage_id: prof.data[0].garage_id, role: memRole, expires_at: null };
  const g = await once(() => sb.from("garages").select("expires_at").eq("id", ctx.garage_id).limit(1));
  if (g.data?.[0]) ctx.expires_at = g.data[0].expires_at;
  if (!mem.data?.[0]) await once(() => sb.from("memberships").insert({ tg_id: id, garage_id: ctx.garage_id, role: memRole }));
  return ctx;
}

async function lastMileageRow(unit_id: number) {
  return await once(() => sb.from("marks").select("mileage,kind,at")
    .eq("unit_id", unit_id).eq("garage_id", ctx.garage_id).not("mileage", "is", null)
    .order("at", { ascending: false }).limit(1));
}

async function lastEngineRow(unit_id: number) {
  return await once(() => sb.from("marks").select("engine_hours,at")
    .eq("unit_id", unit_id).eq("garage_id", ctx.garage_id).not("engine_hours", "is", null)
    .order("at", { ascending: false }).limit(1));
}

async function owns(unit_id: number) {
  const r = await once(() => sb.from("units").select("id").eq("id", unit_id).eq("garage_id", ctx.garage_id).limit(1));
  return r.data?.length === 1;
}

async function busyUnit(unit_id: number, garage_id: number): Promise<number | null> {
  const t = await once(() => sb.from("trips").select("id").eq("garage_id", garage_id).is("end_at", null));
  const tids = (t.data || []).map((x: any) => x.id);
  if (!tids.length) return null;
  const r = await once(() => sb.from("trip_units").select("trip_id").in("trip_id", tids).eq("unit_id", unit_id).limit(1));
  return r.data?.[0]?.trip_id ?? null;
}

async function lastReading(unit_id: number, garage_id: number) {
  const r = await once(() => sb.from("marks").select("mileage,engine_hours,at")
    .eq("unit_id", unit_id).eq("garage_id", garage_id).order("at", { ascending: false }));
  const rows = r.data || [];
  const km = rows.find((x: any) => x.mileage != null)?.mileage ?? null;
  const mh = rows.find((x: any) => x.engine_hours != null)?.engine_hours ?? null;
  return { km: km == null ? null : Number(km), mh: mh == null ? null : Number(mh) };
}

function lessThan(label: string, val: any, cur: number | null): string | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  if (Number.isNaN(n)) return null;
  if (cur !== null && n < cur) return `${label}: значение не может быть меньше текущего (${cur})`;
  return null;
}

async function meterCheck(unit_id: number, mileage: any, mh: any, pfx = ""): Promise<string | null> {
  const cur = await lastReading(unit_id, ctx.garage_id);
  const errs = [
    lessThan(pfx + "пробег", mileage, cur.km),
    lessThan(pfx + "моточасы", mh, cur.mh),
  ].filter(Boolean) as string[];
  return errs.length ? errs.join("; ") : null;
}

async function servicePush(unit_id: number, km: any, mh: any, prevKm: any, prevMh: any) {
  const un = await once(() => sb.from("units").select("model,board_no,service_interval_mh,service_base_mh,service_interval_km,service_base_km").eq("id", unit_id).eq("garage_id", ctx.garage_id).limit(1));
  const u = un.data?.[0];
  if (!u) return;
  const calc = (base: any, int: any, val: any) => (base != null && int != null && val != null) ? Number(base) + Number(int) - Number(val) : null;
  const one = (rem: number | null, prev: number | null, unit: string, thr: number) => {
    if (rem == null || prev == null || prev <= thr || rem > thr) return;
    const txt = rem <= 0
      ? `⚙️ ${u.model}, борт ${u.board_no} — ТО просрочено на ${Math.abs(Math.round(rem))} ${unit}`
      : `⚙️ ${u.model}, борт ${u.board_no} — скоро ТО: осталось ${Math.round(rem)} ${unit}`;
    return notify(ctx.garage_id, txt, "owner");
  };
  const remMh = calc(u.service_base_mh, u.service_interval_mh, mh);
  if (remMh != null) return one(remMh, calc(u.service_base_mh, u.service_interval_mh, prevMh), "мч", 15);
  const remKm = calc(u.service_base_km, u.service_interval_km, km);
  if (remKm != null) return one(remKm, calc(u.service_base_km, u.service_interval_km, prevKm), "км", 100);
}

const dupError = (e: any) => /duplicate|unique/i.test(String(e?.message || "")) ? "такой бортовой номер уже есть в этом гараже" : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const c = await auth(req);
  if (!c) return json({ error: "unauthorized: " + (authFail || "причина неизвестна") }, 401);

  const { action, payload: p = {} } = await req.json().catch(() => ({}));
  const owner = () => ctx.role !== "owner" && ctx.role !== "admin";

  if (action !== "snapshot" && !subActive()) return json({ error: "подписка истекла" }, 402);

  if (action === "snapshot") {
    const [u, m, pt, stf, tr, gn, mems] = await Promise.all([
      once(() => sb.from("units").select("*").eq("garage_id", ctx.garage_id).order("board")),
      once(() => sb.from("marks").select("*").eq("garage_id", ctx.garage_id).order("at")),
      once(() => sb.from("parts").select("*").eq("garage_id", ctx.garage_id)),
      once(() => sb.from("users").select("tg_id," + FIELD_KEY).eq("garage_id", ctx.garage_id).in("role", ["staff", "admin"])),
      once(() => sb.from("trips").select("id,planned_hours,start_at").eq("garage_id", ctx.garage_id).is("end_at", null)),
      once(() => sb.from("garages").select(FIELD_KEY).eq("id", ctx.garage_id).limit(1)),
      once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", ctx.user_id)),
    ]);
    if (u.error || m.error || pt.error) return json({ error: "db: " + [u.error?.message, m.error?.message, pt.error?.message].filter(Boolean).join(" / ") }, 500);

    let open_trips: any[] = [];
    const tids = (tr.data || []).map((t: any) => t.id);
    if (tids.length) {
      const tus = await once(() => sb.from("trip_units").select("trip_id,unit_id,out_mark_id").in("trip_id", tids));
      const omIds = (tus.data || []).map((x: any) => x.out_mark_id).filter(Boolean);
      const [oms, uns] = await Promise.all([
        omIds.length ? once(() => sb.from("marks").select("id,at,due_at,mileage,fuel,engine_hours").in("id", omIds)) : Promise.resolve({ data: [] }),
        once(() => sb.from("units").select("id,model,board_no,track_km,track_mh").eq("garage_id", ctx.garage_id)),
      ]);
      const omap = new Map((oms.data || []).map((x: any) => [x.id, x]));
      const umap = new Map((uns.data || []).map((x: any) => [x.id, x]));
      const byTrip = new Map<number, any[]>();
      for (const r of tus.data || []) {
        if (!byTrip.has(r.trip_id)) byTrip.set(r.trip_id, []);
        byTrip.get(r.trip_id)!.push(r);
      }
      open_trips = (tr.data || []).map((t: any) => ({
        trip_id: t.id,
        planned_hours: t.planned_hours,
        start_at: t.start_at,
        units: (byTrip.get(t.id) || []).map((r: any) => {
          const un = umap.get(r.unit_id) || {};
          const om = omap.get(r.out_mark_id) || {};
          return {
            unit_id: r.unit_id,
            model: un.model,
            board_no: un.board_no,
            track_km: un.track_km !== false,
            track_mh: un.track_mh !== false,
            out: { at: om.at, due_at: om.due_at, mileage: om.mileage, fuel: om.fuel, engine_hours: om.engine_hours },
          };
        }),
      }));
    }

    let invite_code: string | null = null;
    if (ctx.role === "owner") {
      const ic = await once(() => sb.from("garages").select("invite_code").eq("id", ctx.garage_id).limit(1));
      invite_code = ic.data?.[0]?.invite_code ?? null;
    }

    const roleMap = new Map<number, string>((mems.data || []).map((x: any) => [Number(x.garage_id), x.role]));
    roleMap.set(ctx.garage_id, ctx.role);
    const mids = [...roleMap.keys()];
    let garages_list: any[] = [];
    let members: any[] = [];
    if (mids.length) {
      const gl = await once(() => sb.from("garages").select("id," + FIELD_KEY).in("id", mids));
      garages_list = (gl.data || []).map((g: any) => ({ garage_id: g.id, [FIELD_KEY]: g[FIELD_KEY], role: roleMap.get(g.id) || "staff" }));
      const mm = await once(() => sb.from("memberships").select("garage_id,tg_id,role").in("garage_id", mids));
      const tgs = [...new Set((mm.data || []).map((x: any) => String(x.tg_id)))];
      const un = tgs.length ? await once(() => sb.from("users").select("tg_id," + FIELD_KEY).in("tg_id", tgs)) : { data: [] };
      const nmap = new Map((un.data || []).map((x: any) => [String(x.tg_id), x[FIELD_KEY]]));
      members = (mm.data || []).map((x: any) => ({ garage_id: x.garage_id, tg_id: String(x.tg_id), role: x.role, [FIELD_KEY]: nmap.get(String(x.tg_id)) || null }));
    }

    return json({ role: ctx.role, user_id: ctx.user_id, garage_id: ctx.garage_id,
      subscription: { active: subActive(), expires_at: ctx.expires_at },
      garage_name: gn.data?.[0]?.[FIELD_KEY] ?? null,
      garages_list, members, invite_code,
      units: u.data, marks: m.data, parts: pt.data, staff: stf.error ? [] : (stf.data || []),
      open_trips });
  }

  if (action === "garage_switch") {
    const gid = Number(p.garage_id);
    const mem = await once(() => sb.from("memberships").select("role").eq("tg_id", ctx.user_id).eq("garage_id", gid).limit(1));
    if (!mem.data?.[0]) return json({ error: "нет доступа к этому гаражу" }, 403);
    const up = await once(() => sb.from("users").update({ garage_id: gid, role: mem.data[0].role }).eq("tg_id", ctx.user_id));
    if (up.error) return json({ error: "db: " + up.error.message }, 500);
    return json({ ok: true });
  }

  if (action === "garage_leave") {
    const gid = Number(p.garage_id);
    const mem = await once(() => sb.from("memberships").select("role").eq("tg_id", ctx.user_id).eq("garage_id", gid).limit(1));
    if (!mem.data?.[0]) return json({ error: "ты не в этом гараже" }, 404);
    if (mem.data[0].role === "owner") return json({ error: "владелец не увольняется — гараж можно только удалить" }, 400);
    await once(() => sb.from("memberships").delete().eq("tg_id", ctx.user_id).eq("garage_id", gid));
    if (ctx.garage_id === gid) {
      const other = await once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", ctx.user_id).neq("garage_id", gid).limit(1));
      if (other.data?.[0]) {
        await once(() => sb.from("users").update({ garage_id: other.data[0].garage_id, role: other.data[0].role }).eq("tg_id", ctx.user_id));
      } else {
        await once(() => sb.from("users").delete().eq("tg_id", ctx.user_id));
      }
    }
    return json({ ok: true });
  }

  if (action === "garage_delete") {
    const gid = Number(p.garage_id);
    const mem = await once(() => sb.from("memberships").select("role").eq("tg_id", ctx.user_id).eq("garage_id", gid).limit(1));
    if (!mem.data?.[0] || mem.data[0].role !== "owner") return json({ error: "только владелец может удалить гараж" }, 403);
    const mems = await once(() => sb.from("memberships").select("tg_id").eq("garage_id", gid));
    for (const mm of mems.data || []) {
      const us = await once(() => sb.from("users").select("garage_id," + FIELD_KEY).eq("tg_id", mm.tg_id).limit(1));
      const usRow = us.data?.[0];
      if (usRow && Number(usRow.garage_id) === gid) {
        const other = await once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", mm.tg_id).neq("garage_id", gid).limit(1));
        if (other.data?.[0]) {
          await once(() => sb.from("users").upsert({ tg_id: mm.tg_id, garage_id: other.data[0].garage_id, role: other.data[0].role, [FIELD_KEY]: usRow[FIELD_KEY] }));
        } else {
          await once(() => sb.from("users").delete().eq("tg_id", mm.tg_id));
        }
      }
    }
    await once(() => sb.from("memberships").delete().eq("garage_id", gid));
    const gt = await once(() => sb.from("trips").select("id").eq("garage_id", gid));
    const gtids = (gt.data || []).map((x: any) => x.id);
    if (gtids.length) await once(() => sb.from("trip_units").delete().in("trip_id", gtids));
    await once(() => sb.from("trips").delete().eq("garage_id", gid));
    await once(() => sb.from("marks").delete().eq("garage_id", gid));
    await once(() => sb.from("parts").delete().eq("garage_id", gid));
    await once(() => sb.from("units").delete().eq("garage_id", gid));
    const del = await once(() => sb.from("garages").delete().eq("id", gid));
    if (del.error) return json({ error: "db: " + del.error.message }, 500);
    if (gid === ctx.garage_id) {
      const other = await once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", ctx.user_id).neq("garage_id", gid).limit(1));
      if (other.data?.[0]) {
        ctx = { ...ctx, garage_id: other.data[0].garage_id, role: other.data[0].role };
      }
    }
    return json({ ok: true, next_garage_id: ctx.garage_id });
  }

  if (action === "staff_role") {
    if (ctx.role !== "owner") return json({ error: "owner only" }, 403);
    const tid = String(p.tg_id || "").trim();
    const role = p.admin === true || p.admin === "yes" ? "admin" : "staff";
    const mem = await once(() => sb.from("memberships").update({ role }).eq("tg_id", tid).eq("garage_id", ctx.garage_id));
    if (mem.error) return json({ error: "db: " + mem.error.message }, 500);
    await once(() => sb.from("users").update({ role }).eq("tg_id", tid).eq("garage_id", ctx.garage_id));
    return json({ ok: true });
  }

  if (action === "trip_open") {
    const units = Array.isArray(p.units) ? p.units : [];
    const hours = Number(p.planned_hours) > 0 ? Number(p.planned_hours) : 2;
    if (!units.length || units.length > 20) return json({ error: "нужны 1..20 машин" }, 400);
    const ids = units.map((x: any) => Number(x.unit_id)).filter(Boolean);
    if (ids.length !== units.length) return json({ error: "нужны unit_id" }, 400);
    if (new Set(ids).size !== ids.length) return json({ error: "машины повторяются" }, 400);

    const own = await once(() => sb.from("units").select("id,model,board_no").eq("garage_id", ctx.garage_id).in("id", ids));
    if ((own.data || []).length !== ids.length) return json({ error: "нет такой единицы" }, 404);

    const openT = await once(() => sb.from("trips").select("id").eq("garage_id", ctx.garage_id).is("end_at", null));
    const openTids = (openT.data || []).map((t: any) => t.id);
    const busy = new Set<number>();
    if (openTids.length) {
      const bu = await once(() => sb.from("trip_units").select("unit_id").in("trip_id", openTids));
      for (const r of bu.data || []) busy.add(Number(r.unit_id));
    }
    const ms = await once(() => sb.from("marks").select("unit_id,kind,at").eq("garage_id", ctx.garage_id).order("at", { ascending: false }));
    const seen = new Set<number>();
    for (const r of ms.data || []) {
      const uid = Number(r.unit_id);
      if (seen.has(uid)) continue;
      seen.add(uid);
      if (r.kind === "out") busy.add(uid);
    }
    const clash = ids.filter((x) => busy.has(x));
    if (clash.length) return json({ error: "машины уже заняты", units: clash }, 400);

    for (const it of units) {
      const uid = Number(it.unit_id);
      const unv = await once(() => sb.from("units").select("model,board_no").eq("id", uid).limit(1));
      const uvv = unv.data?.[0] || {};
      const err = await meterCheck(uid, it.mileage, it.mh, `${uvv.model || ""}, борт ${uvv.board_no || ""}: `);
      if (err) return json({ error: err }, 400);
    }

    const tIns = await once(() => sb.from("trips").insert({ garage_id: ctx.garage_id, planned_hours: hours, created_by: ctx.user_id }).select("id"));
    if (tIns.error || !tIns.data?.[0]) return json({ error: "db: " + (tIns.error?.message || "trip") }, 500);
    const trip_id = tIns.data[0].id;

    const due = new Date(Date.now() + hours * 3600e3).toISOString();
    const lines: string[] = [];
    for (const it of units) {
      const unit_id = Number(it.unit_id);
      const mk = await once(() => sb.from("marks").insert(clean({
        unit_id, garage_id: ctx.garage_id, kind: "out", at: new Date().toISOString(), due_at: due,
        mileage: Number(it.mileage) || null,
        fuel: Number(it.fuel) || 0,
        engine_hours: Number(it.mh) || null,
        who: ctx.user_id, trip_id,
      })).select("id"));
      if (mk.error || !mk.data?.[0]) return json({ error: "db: " + (mk.error?.message || "mark") }, 500);
      const tuIns = await once(() => sb.from("trip_units").insert({ trip_id, unit_id, out_mark_id: mk.data[0].id }));
      if (tuIns.error) return json({ error: "db: " + tuIns.error.message }, 500);
      const un = (own.data || []).find((x: any) => x.id === unit_id);
      if (un) lines.push(`• ${un.model}, борт ${un.board_no}`);
    }
    await notify(ctx.garage_id, `🚩 Группа выехала на ${hours} ч.\n${lines.join("\n")}`, "owner");
    return json({ ok: true, trip_id });
  }

  if (action === "trip_close") {
    const units = Array.isArray(p.units) ? p.units : [];
    const t = await once(() => sb.from("trips").select("id,planned_hours,start_at").eq("id", Number(p.trip_id)).eq("garage_id", ctx.garage_id).is("end_at", null).limit(1));
    if (!t.data?.[0]) return json({ error: "маршрут не найден" }, 404);
    const trip = t.data[0];

    const links = await once(() => sb.from("trip_units").select("id,unit_id,out_mark_id").eq("trip_id", trip.id));
    if (links.error) return json({ error: "db: " + links.error.message }, 500);
    const byUnit = new Map((links.data || []).map((r: any) => [Number(r.unit_id), r]));
    const req = new Map(units.map((x: any) => [Number(x.unit_id), x]));
    if (req.size !== byUnit.size) return json({ error: "нужны данные по всем машинам маршрута" }, 400);

    const omIds = (links.data || []).map((r: any) => r.out_mark_id).filter(Boolean);
    const om = omIds.length ? await once(() => sb.from("marks").select("id,mileage,engine_hours,fuel,at").in("id", omIds)) : { data: [] };
    const omap = new Map((om.data || []).map((x: any) => [x.id, x]));
    const unIds = [...byUnit.keys()];
    const unRes = unIds.length ? await once(() => sb.from("units").select("id,model,board_no").in("id", unIds)) : { data: [] };
    const umap = new Map((unRes.data || []).map((x: any) => [x.id, x]));

    for (const [unit_id, link] of byUnit) {
      const it = req.get(unit_id) || {};
      const unv = umap.get(unit_id) || {};
      const err = await meterCheck(unit_id, it.mileage, it.mh, `${unv.model || ""}, борт ${unv.board_no || ""}: `);
      if (err) return json({ error: err }, 400);
    }

    const rows: any[] = [];
    for (const [unit_id, link] of byUnit) {
      const it = req.get(unit_id) || {};
      const o = omap.get(link.out_mark_id) || {};
      const mk = await once(() => sb.from("marks").insert(clean({
        unit_id, garage_id: ctx.garage_id, kind: "in", at: new Date().toISOString(),
        mileage: Number(it.mileage) || null,
        fuel: Number(it.fuel) || 0,
        engine_hours: Number(it.mh) || null,
        damage: it.damage === "yes" || it.damage === true,
        note: it.note ? String(it.note).slice(0, 500) : null,
        who: ctx.user_id, trip_id: trip.id,
      })).select("id"));
      if (mk.error || !mk.data?.[0]) return json({ error: "db: " + (mk.error?.message || "mark") }, 500);
      const up = await once(() => sb.from("trip_units").update({ in_mark_id: mk.data[0].id }).eq("id", link.id));
      if (up.error) return json({ error: "db: " + up.error.message }, 500);
      await servicePush(unit_id, it.mileage, it.mh, o.mileage, o.engine_hours);
      rows.push({ unit_id, out: o, inc: { mileage: it.mileage, mh: it.mh }, damage: it.damage === "yes" || it.damage === true, note: it.note || null });
    }

    const end = await once(() => sb.from("trips").update({ end_at: new Date().toISOString() }).eq("id", trip.id));
    if (end.error) return json({ error: "db: " + end.error.message }, 500);

    const mins = (Date.now() - new Date(trip.start_at).getTime()) / 60000;
    const body: string[] = [`✅ Группа вернулась. Заняло ${fmtDur(mins)} (план ${trip.planned_hours} ч).`];
    const dmg: string[] = [];
    for (const r of rows) {
      const un = umap.get(r.unit_id) || {};
      const label = [un.model, un.board_no ? `борт ${un.board_no}` : ""].filter(Boolean).join(", ");
      const bits: string[] = [];
      if (r.inc.mileage != null && r.out.mileage != null) bits.push(`+${Number(r.inc.mileage) - Number(r.out.mileage)} км`);
      if (r.inc.mh != null && r.out.engine_hours != null) bits.push(`+${Math.round((Number(r.inc.mh) - Number(r.out.engine_hours)) * 10) / 10} мч`);
      body.push(`• ${label}: ${bits.join(", ")}`);
      if (r.damage) dmg.push(`⚠ ${label}: ${r.note || "без описания"}`);
    }
    body.push(dmg.length ? dmg.join("\n") : "Повреждений нет.");
    await notify(ctx.garage_id, body.join("\n"), "owner");
    return json({ ok: true });
  }

  if (action === "mark") {
    const kind = p.kind || p.type;
    if (!p.unit_id || !["out", "in", "service", "mileage"].includes(kind)) return json({ error: "bad mark" }, 400);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    if (kind === "out" || kind === "in") {
      const b = await busyUnit(Number(p.unit_id), ctx.garage_id);
      if (b) return json({ error: "машина в маршруте — отметьте через маршрут" }, 400);
      const err = await meterCheck(Number(p.unit_id), p.mileage, p.engine_hours);
      if (err) return json({ error: err }, 400);
    }
    const prev = (kind === "in" || kind === "mileage") ? await lastReading(Number(p.unit_id), ctx.garage_id) : null;
    const row: any = { unit_id: p.unit_id, garage_id: ctx.garage_id, kind, at: new Date().toISOString(), who: ctx.user_id };
    if (kind === "out") {
      row.mileage = Number(p.mileage) || null;
      row.engine_hours = Number(p.engine_hours) || null;
      row.due_at = new Date(Date.now() + (Number(p.hours) || 2) * 3600e3).toISOString();
    }
    if (kind === "in") {
      row.mileage = Number(p.mileage) || null;
      row.fuel = Number(p.fuel) || 0;
      row.engine_hours = Number(p.engine_hours) || null;
      row.damage = p.damage === "yes";
      row.note = p.note ? String(p.note).slice(0, 500) : null;
    }
    if (kind === "mileage") row.mileage = Number(p.mileage) || null;
    const { error } = await once(() => sb.from("marks").insert(row));
    if (error) return json({ error: "db: " + error.message }, 500);
    if (kind === "out" || kind === "in") {
      await once(() => sb.from("units").update({ status_manual: null }).eq("id", p.unit_id).eq("garage_id", ctx.garage_id));
    }
    if (kind === "in") {
      const un = await once(() => sb.from("units").select("model,board_no").eq("id", p.unit_id).eq("garage_id", ctx.garage_id).limit(1));
      const unit = un.data?.[0];
      if (unit) {
        if (row.damage) {
          const who = await once(() => sb.from("users").select(FIELD_KEY).eq("tg_id", ctx.user_id).limit(1));
          const whoName = who.data?.[0]?.[FIELD_KEY] || ctx.user_id;
          await notify(ctx.garage_id, `🛠 ${unit.model}, борт ${unit.board_no} — новое повреждение: ${msk(row.at)}, вернул ${whoName}: ${row.note || "без описания"}`);
        }
        await servicePush(Number(p.unit_id), row.mileage, row.engine_hours, prev?.km ?? null, prev?.mh ?? null);
      }
    }
    return json({ ok: true });
  }

  if (action === "mileage_set") {
    if (!p.unit_id || !(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const err = await meterCheck(Number(p.unit_id), p.mileage, null);
    if (err) return json({ error: err }, 400);
    const row: any = { unit_id: p.unit_id, garage_id: ctx.garage_id, kind: "mileage", at: new Date().toISOString(), who: ctx.user_id, mileage: Number(p.mileage) || null };
    if (!row.mileage) return json({ error: "нужен пробег" }, 400);
    const prev = await lastReading(Number(p.unit_id), ctx.garage_id);
    const { error } = await once(() => sb.from("marks").insert(row));
    if (error) return json({ error: "db: " + error.message }, 500);
    await servicePush(Number(p.unit_id), row.mileage, null, prev.km, prev.mh);
    return json({ ok: true });
  }

  if (action === "status_set") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const allowed = ["free", "out", "fuel", "lowfuel", "service"];
    const st = p.status && allowed.includes(p.status) ? p.status : null;
    const { error } = await once(() => sb.from("units").update({ status_manual: st }).eq("id", p.unit_id).eq("garage_id", ctx.garage_id));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "damage_dismiss") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const { error } = await once(() => sb.from("marks").update({ dismissed_at: new Date().toISOString() })
      .eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id).eq("kind", "in").eq("damage", true)
      .is("closed_at", null).is("dismissed_at", null));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "damage_close") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const { error } = await once(() => sb.from("marks").update({ closed_at: new Date().toISOString() })
      .eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id).eq("kind", "in").eq("damage", true).is("closed_at", null));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "service_set") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const lastKm = await lastMileageRow(p.unit_id);
    if (lastKm.error) return json({ error: "db: " + lastKm.error.message }, 500);
    const lastMh = await lastEngineRow(p.unit_id);
    if (lastMh.error) return json({ error: "db: " + lastMh.error.message }, 500);
    const { error } = await once(() => sb.from("units").update({
      service_interval_km: Number(p.interval_km) || null,
      service_base_km: lastKm.data?.[0]?.mileage ?? null,
      service_interval_mh: Number(p.interval_mh) || null,
      service_base_mh: lastMh.data?.[0]?.engine_hours ?? null,
    }).eq("id", p.unit_id).eq("garage_id", ctx.garage_id));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "service_done") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const lastKm = await lastMileageRow(p.unit_id);
    if (lastKm.error) return json({ error: "db: " + lastKm.error.message }, 500);
    const lastMh = await lastEngineRow(p.unit_id);
    if (lastMh.error) return json({ error: "db: " + lastMh.error.message }, 500);
    const { error } = await once(() => sb.from("units").update({
      service_base_km: lastKm.data?.[0]?.mileage ?? null,
      service_base_mh: lastMh.data?.[0]?.engine_hours ?? null,
    }).eq("id", p.unit_id).eq("garage_id", ctx.garage_id));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "market_price") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const { error } = await once(() => sb.from("units").update({
      market_price: Number(p.price) || null, price_at: new Date().toISOString(),
    }).eq("id", p.unit_id).eq("garage_id", ctx.garage_id));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "part_save") {
    const row = clean({
      garage_id: ctx.garage_id,
      title: String(p.title || "").slice(0, 200),
      node: String(p.node || p.title || "").slice(0, 200),
      status: String(p.status || "нужно"),
      urgency: p.urgency || null,
      eta: p.eta || null,
    });
    if (!row.title) return json({ error: "нужно название детали" }, 400);
    if (p.id) {
      delete row.garage_id;
      const { error } = await once(() => sb.from("parts").update(row).eq("id", p.id).eq("garage_id", ctx.garage_id));
      if (error) return json({ error: "db: " + error.message }, 500);
    } else {
      if (!p.unit_id || !(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
      row.unit_id = p.unit_id;
      const { error } = await once(() => sb.from("parts").insert(row));
      if (error) return json({ error: "db: " + error.message }, 500);
    }
    return json({ ok: true });
  }

  if (action === "part_clear") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const { error } = await once(() => sb.from("parts").delete().eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "hist_clear") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const all = await once(() => sb.from("marks").select("id,at,mileage").eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id));
    if (all.error) return json({ error: "db: " + all.error.message }, 500);
    const keep = (all.data || []).filter((r) => r.mileage != null).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
    if (keep) {
      const { error } = await once(() => sb.from("marks").delete().eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id).neq("id", keep.id));
      if (error) return json({ error: "db: " + error.message }, 500);
    } else {
      const { error } = await once(() => sb.from("marks").delete().eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id));
      if (error) return json({ error: "db: " + error.message }, 500);
    }
    return json({ ok: true });
  }

    if (action === "unit_save") {
    if (owner()) return json({ error: "owner only" }, 403);
    const board = String(p.board || "").trim();
    const row = clean({
      board, model: String(p.model || "").trim(),
      board_no: board,
      year: p.year ? Number(p.year) : null,
      photo_url: p.photo_url ? String(p.photo_url) : null,
      purchase_price: p.purchase_price ? Number(p.purchase_price) : null,
      purchase_date: p.purchase_date || null,
      track_km: p.track_km === undefined ? undefined : !!p.track_km,
      track_mh: p.track_mh === undefined ? undefined : !!p.track_mh,
    });
    if (!row.board || !row.model) return json({ error: "нужны номер и модель" }, 400);
    if (p.id) {
      delete row.garage_id;
      const { error } = await once(() => sb.from("units").update(row).eq("id", p.id).eq("garage_id", ctx.garage_id));
      if (error) return json({ error: dupError(error) || ("db: " + error.message) }, dupError(error) ? 400 : 500);
      if (p.mileage != null || p.mh != null) {
        const prevU = await lastReading(Number(p.id), ctx.garage_id);
        const err = await meterCheck(Number(p.id), p.mileage, p.mh);
        if (err) return json({ error: err }, 400);
        await once(() => sb.from("marks").insert({ unit_id: p.id, garage_id: ctx.garage_id, kind: "mileage", at: new Date().toISOString(), who: ctx.user_id, mileage: Number(p.mileage) || null, engine_hours: Number(p.mh) || null }));
        await servicePush(Number(p.id), p.mileage, p.mh, prevU.km, prevU.mh);
      }
    } else {
      row.garage_id = ctx.garage_id;
      const ins = await once(() => sb.from("units").insert(row).select("id"));
      if (ins.error) return json({ error: dupError(ins.error) || ("db: " + ins.error.message) }, dupError(ins.error) ? 400 : 500);
      const newId = ins.data[0].id;
      if (p.mileage != null || p.mh != null) {
        await once(() => sb.from("marks").insert({ unit_id: newId, garage_id: ctx.garage_id, kind: "mileage", at: new Date().toISOString(), who: ctx.user_id, mileage: Number(p.mileage) || null, engine_hours: Number(p.mh) || null }));
      }
      return json({ ok: true, id: newId });
    }
    return json({ ok: true, id: p.id || null });
  }

  if (action === "unit_delete") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const b = await busyUnit(Number(p.unit_id), ctx.garage_id);
    if (b) return json({ error: "сначала закрой маршрут" }, 400);
    for (const q of [
      () => sb.from("marks").delete().eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id),
      () => sb.from("parts").delete().eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id),
      () => sb.from("units").delete().eq("id", p.unit_id).eq("garage_id", ctx.garage_id),
    ]) {
      const { error } = await once(q);
      if (error) return json({ error: "db: " + error.message }, 500);
    }
    return json({ ok: true });
  }

  if (action === "photo_upload") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const b64 = String(p.data_base64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!b64 || b64.length > 7e6) return json({ error: "bad photo" }, 400);
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = (String(p.filename || "photo").split(".").pop() || "jpg").toLowerCase().slice(0, 5);
    const path = `g${ctx.garage_id}_u${p.unit_id || 0}_${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("photos").upload(path, bin, { contentType: p.content_type || "image/jpeg" });
    if (error) return json({ error: "storage: " + error.message }, 500);
    const { data } = sb.storage.from("photos").getPublicUrl(path);
    return json({ ok: true, url: data.publicUrl });
  }

  if (action === "staff_save") {
    if (owner()) return json({ error: "owner only" }, 403);
    const tg_id = String(p.tg_id || "").trim();
    const nm = String(p[FIELD_KEY] || "").trim();
    if (!tg_id || !nm) return json({ error: "нужны имя и Telegram ID" }, 400);
    const taken = await once(() => sb.from("users").select("garage_id,role").eq("tg_id", tg_id).limit(1));
    if (taken.data?.[0]?.garage_id === ctx.garage_id && taken.data[0].role === "owner") {
      return json({ error: "это владелец этого гаража" }, 400);
    }
    let up;
    if (taken.data?.[0]) {
      up = await once(() => sb.from("users").update({ [FIELD_KEY]: nm }).eq("tg_id", tg_id));
    } else {
      up = await once(() => sb.from("users").insert({ tg_id, garage_id: ctx.garage_id, role: "staff", [FIELD_KEY]: nm }));
    }
    if (up.error) return json({ error: "db: " + up.error.message }, 500);
    await once(() => sb.from("memberships").upsert({ tg_id, garage_id: ctx.garage_id, role: "staff" }));
    return json({ ok: true });
  }

  if (action === "staff_del") {
    if (ctx.role !== "owner") return json({ error: "owner only" }, 403);
    const tid = String(p.tg_id || "").trim();
    const { error } = await once(() => sb.from("users").delete()
      .eq("tg_id", tid).eq("garage_id", ctx.garage_id).eq("role", "staff"));
    if (error) return json({ error: "db: " + error.message }, 500);
    await once(() => sb.from("memberships").delete().eq("tg_id", tid).eq("garage_id", ctx.garage_id));
    return json({ ok: true });
  }

  if (action === "part_del_last") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const last = await once(() => sb.from("parts").select("id").eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id).order("id", { ascending: false }).limit(1));
    if (last.error) return json({ error: "db: " + last.error.message }, 500);
    if (last.data?.[0]) {
      const { error } = await once(() => sb.from("parts").delete().eq("id", last.data[0].id).eq("garage_id", ctx.garage_id));
      if (error) return json({ error: "db: " + error.message }, 500);
    }
    return json({ ok: true });
  }

  if (action === "trip_del_last") {
    if (owner()) return json({ error: "owner only" }, 403);
    if (!(await owns(p.unit_id))) return json({ error: "нет такой единицы" }, 404);
    const ms = await once(() => sb.from("marks").select("id,kind,at").eq("unit_id", p.unit_id).eq("garage_id", ctx.garage_id).order("at", { ascending: false }));
    if (ms.error) return json({ error: "db: " + ms.error.message }, 500);
    const list = ms.data || [];
    const lastIn = list.find(r => r.kind === "in");
    const ids = [];
    if (lastIn) {
      ids.push(lastIn.id);
      const out = list.find(r => r.kind === "out" && new Date(r.at) < new Date(lastIn.at));
      if (out) ids.push(out.id);
    } else {
      const out = list.find(r => r.kind === "out");
      if (out) ids.push(out.id);
    }
    for (const id of ids) {
      const { error } = await once(() => sb.from("marks").delete().eq("id", id).eq("garage_id", ctx.garage_id));
      if (error) return json({ error: "db: " + error.message }, 500);
    }
    return json({ ok: true });
  }

  if (action === "part_del") {
    if (owner()) return json({ error: "owner only" }, 403);
    const { error } = await once(() => sb.from("parts").delete().eq("id", Number(p.id)).eq("garage_id", ctx.garage_id));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "trip_del") {
    if (owner()) return json({ error: "owner only" }, 403);
    const m = await once(() => sb.from("marks").select("id,unit_id,trip_id,at").eq("id", Number(p.out_id)).eq("garage_id", ctx.garage_id).limit(1));
    if (!m.data?.[0]) return json({ error: "нет такой отметки" }, 404);
    const row = m.data[0];
    if (row.trip_id) return json({ error: "это выезд из маршрута" }, 400);
    const nxt = await once(() => sb.from("marks").select("id").eq("unit_id", row.unit_id).eq("garage_id", ctx.garage_id)
      .eq("kind", "in").is("trip_id", null).gt("at", row.at).order("at").limit(1));
    if (nxt.data?.[0]) {
      const d2 = await once(() => sb.from("marks").delete().eq("id", nxt.data[0].id));
      if (d2.error) return json({ error: "db: " + d2.error.message }, 500);
    }
    const d1 = await once(() => sb.from("marks").delete().eq("id", row.id));
    if (d1.error) return json({ error: "db: " + d1.error.message }, 500);
    return json({ ok: true });
  }

  if (action === "mark_update") {
    if (owner()) return json({ error: "owner only" }, 403);
    const id = Number(p.id);
    const m = await once(() => sb.from("marks").select("id").eq("id", id).eq("garage_id", ctx.garage_id).limit(1));
    if (!m.data?.[0]) return json({ error: "нет такой отметки" }, 404);
    const row: any = {};
    if (p.mileage !== undefined) row.mileage = Number(p.mileage) || null;
    if (p.mh !== undefined) row.engine_hours = Number(p.mh) || null;
    if (p.note !== undefined) row.note = p.note ? String(p.note).slice(0, 500) : null;
    if (!Object.keys(row).length) return json({ error: "нечего менять" }, 400);
    const { error } = await once(() => sb.from("marks").update(row).eq("id", id).eq("garage_id", ctx.garage_id));
    if (error) return json({ error: "db: " + error.message }, 500);
    return json({ ok: true });
  }

  if (action === "trip_remove") {
    if (owner()) return json({ error: "owner only" }, 403);
    const m = await once(() => sb.from("marks").select("id,unit_id,trip_id,at").eq("id", Number(p.out_id)).eq("garage_id", ctx.garage_id).limit(1));
    const row = m.data?.[0];
    if (!row) return json({ error: "нет такой отметки" }, 404);
    if (row.trip_id) {
      const inRow = await once(() => sb.from("marks").select("id").eq("unit_id", row.unit_id).eq("garage_id", ctx.garage_id).eq("kind", "in").eq("trip_id", row.trip_id).order("at", { ascending: false }).limit(1));
      if (inRow.data?.[0]) await once(() => sb.from("marks").delete().eq("id", inRow.data[0].id).eq("garage_id", ctx.garage_id));
      await once(() => sb.from("trip_units").delete().eq("unit_id", row.unit_id).eq("trip_id", row.trip_id));
      await once(() => sb.from("marks").delete().eq("id", row.id).eq("garage_id", ctx.garage_id));
      const left = await once(() => sb.from("trip_units").select("id").eq("trip_id", row.trip_id));
      if (!(left.data || []).length) await once(() => sb.from("trips").delete().eq("id", row.trip_id).eq("garage_id", ctx.garage_id));
    } else {
      const nxt = await once(() => sb.from("marks").select("id").eq("unit_id", row.unit_id).eq("garage_id", ctx.garage_id).eq("kind", "in").is("trip_id", null).gt("at", row.at).order("at").limit(1));
      if (nxt.data?.[0]) await once(() => sb.from("marks").delete().eq("id", nxt.data[0].id).eq("garage_id", ctx.garage_id));
      await once(() => sb.from("marks").delete().eq("id", row.id).eq("garage_id", ctx.garage_id));
    }
    return json({ ok: true });
  }
  
  return json({ error: "unknown action" }, 400);
});
