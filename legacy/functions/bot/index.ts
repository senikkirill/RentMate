import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const TOKEN = Deno.env.get("BOT_TOKEN") || "";
const APP_URL = Deno.env.get("APP_URL") || "";
const secretName = "SECRET_TOKEN";
const envGet = Deno.env.get;
const SECRET = envGet(secretName) || "";
const FIELD_KEY = ["n", "a", "m", "e"].join("");
const NAME_MAX = 18;
const GARAGE_MAX = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function once(make: () => Promise<any>) {
  let a = await make();
  for (let i = 0; i < 2 && a?.error; i++) { await sleep(400); a = await make(); }
  return a;
}

const api = (method: string, body: any) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => ({}));

const menuFor = (hasGarage: boolean) => hasGarage
  ? { keyboard: [["🚗 Мои гаражи"], ["➕ Создать гараж", "🔑 По коду"]], resize_keyboard: true }
  : { keyboard: [["➕ Создать гараж", "🔑 По коду"]], resize_keyboard: true };

const send = (chat_id: any, text: string, keyboard?: any, hasGarage?: boolean) =>
  api("sendMessage", { chat_id, text, ...(keyboard ? { reply_markup: keyboard } : { reply_markup: menuFor(!!hasGarage) }) });

const openBtn = () => APP_URL
  ? { inline_keyboard: [[{ text: "🚗 Открыть приложение", web_app: { url: APP_URL } }]] }
  : undefined;

const randCode = () =>
  Array.from({ length: 6 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");

async function tgSend(chat_id: string | number, text: string) {
  if (!TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id, text }),
    });
  } catch { /* ignore */ }
}

async function notify(garage_id: number, text: string, target: "all" | "owner" = "all") {
  const base = sb.from("users").select("tg_id").eq("garage_id", garage_id);
  const q = target === "owner" ? base.eq("role", "owner") : base;
  const { data } = await once(() => q);
  for (const u of data || []) await tgSend(u.tg_id, text);
}

async function memCount(tg: string): Promise<number> {
  const r = await once(() => sb.from("memberships").select("garage_id").eq("tg_id", tg));
  return (r.data || []).length;
}

async function wipeGarageData(gid: number) {
  const gt = await once(() => sb.from("trips").select("id").eq("garage_id", gid));
  const gtids = (gt.data || []).map((x: any) => x.id);
  if (gtids.length) await once(() => sb.from("trip_units").delete().in("trip_id", gtids));
  await once(() => sb.from("trips").delete().eq("garage_id", gid));
  await once(() => sb.from("marks").delete().eq("garage_id", gid));
  await once(() => sb.from("parts").delete().eq("garage_id", gid));
  await once(() => sb.from("units").delete().eq("garage_id", gid));
}

async function createGarageNamed(chat_id: any, tg: string, tgName: string, title: string) {
  const nm = String(title || "").trim();
  if (!nm) {
    await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "create" }));
    return send(chat_id, `Название пустое. Пришли название гаража (до ${NAME_MAX} символов).`);
  }
  if (nm.length > NAME_MAX) {
    await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "create" }));
    return send(chat_id, `Слишком длинное название — максимум ${NAME_MAX} символов. Пришли покороче.`);
  }
  const ex = await once(() => sb.from("users").select("garage_id").eq("tg_id", tg).limit(1));
  if (ex.data?.[0]) return send(chat_id, "У тебя уже есть свой гараж. Чужой можно подключить кнопкой «🔑 По коду».");
  if ((await memCount(tg)) >= GARAGE_MAX) return send(chat_id, `Уже ${GARAGE_MAX} гаража — больше нельзя. Выйди из лишнего и попробуй снова.`);
  const g = await once(() => sb.from("garages")
    .insert({ [FIELD_KEY]: nm, invite_code: randCode() })
    .select("id,invite_code").limit(1));
  if (g.error || !g.data?.[0]) return send(chat_id, "Не получилось создать гараж. Попробуй ещё раз.");
  await once(() => sb.from("users").insert({ tg_id: tg, garage_id: g.data[0].id, role: "owner", [FIELD_KEY]: tgName || "Владелец" }));
  await once(() => sb.from("memberships").insert({ tg_id: tg, garage_id: g.data[0].id, role: "owner" }));
  return send(chat_id, `Гараж «${nm}» создан!\nКод для сотрудников: ${g.data[0].invite_code}\nПоменяй его, если утечёт.`, openBtn());
}

async function joinByCode(chat_id: any, tg: string, tgName: string, raw: string) {
  const code = String(raw || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "join" }));
    return send(chat_id, "Код — 6 символов, буквы и цифры. Отправь ещё раз.");
  }
  const g = await once(() => sb.from("garages").select("id,invite_code").eq("invite_code", code).limit(1));
  if (!g.data?.[0]) {
    await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "join" }));
    return send(chat_id, "Такого кода нет. Проверь и отправь ещё раз.");
  }
  const gid = g.data[0].id;
  const ex = await once(() => sb.from("users").select("garage_id,role").eq("tg_id", tg).limit(1));
  if (ex.data?.[0] && ex.data[0].garage_id === gid && ex.data[0].role === "owner") {
    return send(chat_id, "Это твой собственный гараж — по коду к себе не подключаются 🙂");
  }
  const mine = await once(() => sb.from("memberships").select("role").eq("tg_id", tg).eq("garage_id", gid).limit(1));
  if (mine.data?.[0]) {
    await once(() => sb.from("memberships").update({ role: "staff" }).eq("tg_id", tg).eq("garage_id", gid));
  } else {
    if ((await memCount(tg)) >= GARAGE_MAX) return send(chat_id, `Уже ${GARAGE_MAX} гаража — больше нельзя. Выйди из лишнего и попробуй снова.`);
    if (ex.data?.[0]) {
      await once(() => sb.from("memberships").insert({ tg_id: tg, garage_id: gid, role: "staff" }));
    } else {
      await once(() => sb.from("users").insert({ tg_id: tg, garage_id: gid, role: "staff", [FIELD_KEY]: tgName || "Сотрудник" }));
      await once(() => sb.from("memberships").insert({ tg_id: tg, garage_id: gid, role: "staff" }));
    }
  }
  const gname = await once(() => sb.from("garages").select(FIELD_KEY).eq("id", gid).limit(1));
  return send(chat_id, `Готово! Ты в «${gname.data?.[0]?.[FIELD_KEY] || "гараже"}».\nВ приложении переключай гаражи кнопкой в шапке.`, openBtn());
}

async function renameGarage(chat_id: any, tg: string, title: string) {
  const nm = String(title || "").trim();
  if (!nm) return send(chat_id, "Напиши так: /rename 4x4 Drive");
  if (nm.length > NAME_MAX) {
    await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "rename" }));
    return send(chat_id, `Слишком длинное название — максимум ${NAME_MAX} символов. Пришли покороче.`);
  }
  const us = await once(() => sb.from("users").select("garage_id,role").eq("tg_id", tg).limit(1));
  if (!us.data?.[0]) return send(chat_id, "Сначала создай гараж: /start");
  if (us.data[0].role !== "owner") return send(chat_id, "Переименовать может только владелец гаража.");
  const up = await once(() => sb.from("garages").update({ [FIELD_KEY]: nm }).eq("id", us.data[0].garage_id));
  if (up.error) return send(chat_id, "Не получилось. Попробуй ещё раз.");
  return send(chat_id, `Готово! Теперь гараж называется «${nm}».`);
}

async function garagesList(chat_id: any, tg: string) {
  const us = await once(() => sb.from("users").select("garage_id,role").eq("tg_id", tg).limit(1));
  if (!us.data?.[0]) return send(chat_id, "Сначала создай гараж: /start");
  const active = us.data[0].garage_id;
  const mems = await once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", tg));
  const ids = (mems.data || []).map((x: any) => x.garage_id);
  const gl = ids.length ? await once(() => sb.from("garages").select("id," + FIELD_KEY).in("id", ids)) : { data: [] };
  const nameOf = (id: number) => {
    const r = (gl.data || []).find((x: any) => x.id === id);
    return r ? r[FIELD_KEY] : `№${id}`;
  };
  const roleTxt = (r: string) => r === "owner" ? "владелец" : r === "admin" ? "полный доступ" : "сотрудник";
  const rows = (mems.data || []).map((x: any) => {
    const cur = Number(x.garage_id) === active;
    const nm = nameOf(Number(x.garage_id));
    return cur
      ? [{ text: `✅ ${nm} · ${roleTxt(x.role)}` }]
      : [{ text: `${nm} · ${roleTxt(x.role)}`, callback_data: `gsw:${x.garage_id}` }];
  });
  const acts: any[] = [];
  if (us.data[0].role === "owner") acts.push([{ text: "🗑 Удалить этот гараж", callback_data: "dga" }]);
  else acts.push([{ text: "🚪 Уволиться из гаража", callback_data: "lv" }]);
  acts.push([{ text: "✏️ Переименовать", callback_data: "ren" }]);
  return send(chat_id, `Твои гаражи (${(mems.data || []).length} из ${GARAGE_MAX}):`, { inline_keyboard: [...rows, ...acts] });
}

async function switchGarage(chat_id: any, tg: string, gid: number) {
  const mem = await once(() => sb.from("memberships").select("role").eq("tg_id", tg).eq("garage_id", gid).limit(1));
  if (!mem.data?.[0]) return send(chat_id, "Нет доступа к этому гаражу.");
  await once(() => sb.from("users").update({ garage_id: gid, role: mem.data[0].role }).eq("tg_id", tg));
  const gname = await once(() => sb.from("garages").select(FIELD_KEY).eq("id", gid).limit(1));
  return send(chat_id, `Переключился на «${gname.data?.[0]?.[FIELD_KEY] || "гараж"}».`, openBtn());
}

async function leaveGarage(chat_id: any, tg: string) {
  const us = await once(() => sb.from("users").select("garage_id,role").eq("tg_id", tg).limit(1));
  if (!us.data?.[0]) return send(chat_id, "Сначала создай гараж: /start");
  const gid = us.data[0].garage_id;
  if (us.data[0].role === "owner") return send(chat_id, "Ты владелец — увольняться некуда. Свой гараж можно удалить: кнопка 🗑 в списке.");
  await once(() => sb.from("memberships").delete().eq("tg_id", tg).eq("garage_id", gid));
  const other = await once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", tg).neq("garage_id", gid).limit(1));
  if (other.data?.[0]) {
    await once(() => sb.from("users").update({ garage_id: other.data[0].garage_id, role: other.data[0].role }).eq("tg_id", tg));
    return send(chat_id, "Уволился. Переключил тебя на другой твой гараж.");
  }
  await once(() => sb.from("users").delete().eq("tg_id", tg));
  return send(chat_id, "Уволился. Создать новый гараж — /start");
}

async function deleteGarage(chat_id: any, tg: string) {
  const us = await once(() => sb.from("users").select("garage_id,role").eq("tg_id", tg).limit(1));
  if (!us.data?.[0]) return send(chat_id, "Сначала создай гараж: /start");
  const gid = us.data[0].garage_id;
  if (us.data[0].role !== "owner") return send(chat_id, "Удалять может только владелец.");
  const mems = await once(() => sb.from("memberships").select("tg_id").eq("garage_id", gid));
  const gname = await once(() => sb.from("garages").select(FIELD_KEY).eq("id", gid).limit(1));
  for (const mm of mems.data || []) {
    const usRow = await once(() => sb.from("users").select("garage_id," + FIELD_KEY).eq("tg_id", mm.tg_id).limit(1));
    const row = usRow.data?.[0];
    if (row && Number(row.garage_id) === gid) {
      const other = await once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", mm.tg_id).neq("garage_id", gid).limit(1));
      if (other.data?.[0]) {
        await once(() => sb.from("users").upsert({ tg_id: mm.tg_id, garage_id: other.data[0].garage_id, role: other.data[0].role, [FIELD_KEY]: row[FIELD_KEY] }));
        await tgSend(mm.tg_id, `Гараж «${gname.data?.[0]?.[FIELD_KEY] || ""}» удалён. Ты переключён на другой свой гараж.`);
      } else {
        await once(() => sb.from("users").delete().eq("tg_id", mm.tg_id));
        await tgSend(mm.tg_id, `Гараж «${gname.data?.[0]?.[FIELD_KEY] || ""}» удалён. Создать новый — /start`);
      }
    }
  }
  await once(() => sb.from("memberships").delete().eq("garage_id", gid));
  await wipeGarageData(gid);
  const del = await once(() => sb.from("garages").delete().eq("id", gid));
  if (del.error) return send(chat_id, "Не получилось. Попробуй ещё раз.");
  const other = await once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", tg).neq("garage_id", gid).limit(1));
  if (other.data?.[0]) {
    await once(() => sb.from("users").update({ garage_id: other.data[0].garage_id, role: other.data[0].role }).eq("tg_id", tg));
    return send(chat_id, `Гараж «${gname.data?.[0]?.[FIELD_KEY] || ""}» удалён. Твой активный — другой.`, openBtn());
  }
  return send(chat_id, "Гараж удалён. Создать новый — /start");
}

async function onStart(msg: any, arg: string) {
  const tg = String(msg.from.id);
  const tgName = String(msg.from.first_name || "");
  const ex = await once(() => sb.from("users").select("garage_id").eq("tg_id", tg).limit(1));
  if (ex.data?.[0]) {
    return send(msg.chat.id, "Привет! Ты в списке гаража. Кнопки внизу — твоё меню.", menuFor(true));
  }
  const mems = await once(() => sb.from("memberships").select("garage_id,role").eq("tg_id", tg).limit(1));
  if (mems.data?.[0]) {
    await once(() => sb.from("users").insert({ tg_id: tg, garage_id: mems.data[0].garage_id, role: mems.data[0].role, [FIELD_KEY]: tgName || "Участник" }));
    return send(msg.chat.id, "Восстановил твой доступ. Кнопки внизу — твоё меню.", menuFor(true));
  }
  if (arg) return joinByCode(msg.chat.id, tg, tgName, arg);
  return send(msg.chat.id, "Привет! Я Мэйт, твой гаражный ассистент. Помогаю с выездами, пробегом, моточасами, ТО и запчастями.\n\nВыбери действие внизу 👇", menuFor(false));
}


async function daily() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 3 * 86400e3);
  const [units, parts] = await Promise.all([
    once(() => sb.from("units").select("id,model,board_no,garage_id")),
    once(() => sb.from("parts").select("unit_id,title,eta,status,garage_id").not("eta", "is", null).neq("status", "пришло")),
  ]);
  const umap = new Map((units.data || []).map((u: any) => [u.id, u]));

  const partsByG = new Map<number, string[]>();
  for (const p of parts.data || []) {
    const eta = new Date(p.eta);
    eta.setUTCHours(0, 0, 0, 0);
    if (eta < today || eta > horizon) continue;
    const days = Math.round((eta.getTime() - today.getTime()) / 86400e3);
    const u = umap.get(p.unit_id);
    const when = days === 0 ? "сегодня" : days === 1 ? "завтра" : `через ${days} дн.`;
    const line = `🔧 ${u?.model || "?"}${u?.board_no ? `, борт ${u.board_no}` : ""} — ${p.title}: ожидается ${when}`;
    const arr = partsByG.get(p.garage_id) || [];
    arr.push(line);
    partsByG.set(p.garage_id, arr);
  }
  for (const [gid, lines] of partsByG) await notify(gid, lines.join("\n"), "all");
}

async function late() {
  const now = Date.now();
  const tr = await once(() => sb.from("trips")
    .select("id,garage_id,start_at,planned_hours,trip_units(unit_id,units(model,board_no))")
    .is("end_at", null).eq("late_notified", false));

  for (const t of tr.data || []) {
    const due = new Date(t.start_at).getTime() + Number(t.planned_hours) * 3600e3;
    if (due + 15 * 60e3 >= now) continue;
    const cars = (t.trip_units || []).map((tu: any) => {
      const un = tu.units || {};
      return `${un.model || ""}, борт ${un.board_no || ""}`;
    });
    await notify(t.garage_id, `⏰ Группа должна была вернуться 15 минут назад: ${cars.join(" · ")}`, "owner");
    await once(() => sb.from("trips").update({ late_notified: true }).eq("id", t.id));
  }
}

async function handle(upd: any) {
  if (upd.cron === "daily") return daily();
  if (upd.cron === "late") return late();

  const cb = upd.callback_query;
  if (cb) {
    api("answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
    const chat = cb.message?.chat?.id;
    const tg = String(cb.from.id);
    if (!chat) return;
    if (cb.data === "create_garage") {
      const ex = await once(() => sb.from("users").select("garage_id").eq("tg_id", tg).limit(1));
      if (ex.data?.[0]) return send(chat, "У тебя уже есть свой гараж. Чужой — кнопкой «🔑 По коду».", menuFor(true));
      await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "create" }));
      return send(chat, `Как называется твой прокат? Пришли название одним сообщением, до ${NAME_MAX} символов (например: 4x4 Drive).`);
    }
    if (cb.data === "join_code") {
      await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "join" }));
      return send(chat, "Отправь код гаража одним сообщением (6 символов, буквы и цифры).");
    }
    if (cb.data === "ren") {
      await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "rename" }));
      return send(chat, `Пришли новое название гаража (до ${NAME_MAX} символов) одним сообщением.`);
    }
    if (cb.data?.startsWith("gsw:")) return switchGarage(chat, tg, Number(cb.data.slice(4)));
    if (cb.data === "lv") return leaveGarage(chat, tg);
    if (cb.data === "dga") return deleteGarage(chat, tg);
    return;
  }

  const msg = upd.message;
  if (!msg || !msg.text) return;
  const text = String(msg.text).trim();
  const tg = String(msg.from.id);
  const tgName = String(msg.from.first_name || "");

  if (text === "/myid") return send(msg.chat.id, `Твой Telegram ID: ${tg}`);
  if (text === "/start" || text.startsWith("/start ")) {
    await once(() => sb.from("bot_pending").delete().eq("tg_id", tg));
    return onStart(msg, text.slice("/start".length).trim());
  }
  if (text === "/rename") return renameGarage(msg.chat.id, tg, "");
  if (text.startsWith("/rename ")) return renameGarage(msg.chat.id, tg, text.slice(8));
  if (text === "/garages" || text.includes("Мои гаражи")) return garagesList(msg.chat.id, tg);
  if (text === "/leave") return leaveGarage(msg.chat.id, tg);
  if (text === "/delgarage") return deleteGarage(msg.chat.id, tg);
  if (text.includes("Создать гараж")) {
    const ex = await once(() => sb.from("users").select("garage_id").eq("tg_id", tg).limit(1));
    if (ex.data?.[0]) return send(msg.chat.id, "У тебя уже есть свой гараж. Чужой — кнопкой «🔑 По коду».", menuFor(true));
    await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "create" }));
    return send(msg.chat.id, `Как называется твой прокат? Пришли название одним сообщением, до ${NAME_MAX} символов (например: 4x4 Drive).`);
  }
  if (text.includes("По коду")) {
    await once(() => sb.from("bot_pending").upsert({ tg_id: tg, action: "join" }));
    return send(msg.chat.id, "Отправь код гаража одним сообщением (6 символов, буквы и цифры).");
  }
  if (text.startsWith("/")) {
    const ex = await once(() => sb.from("users").select("garage_id").eq("tg_id", tg).limit(1));
    return send(msg.chat.id, "Не знаю такую команду. Кнопки внизу — твоё меню.", menuFor(!!ex.data?.[0]));
  }

  const pend = await once(() => sb.from("bot_pending").select("action").eq("tg_id", tg).limit(1));
  if (pend.data?.[0]) {
    const act = pend.data[0].action;
    await once(() => sb.from("bot_pending").delete().eq("tg_id", tg));
    if (act === "create") return createGarageNamed(msg.chat.id, tg, tgName, text);
    if (act === "join") return joinByCode(msg.chat.id, tg, tgName, text);
    if (act === "rename") return renameGarage(msg.chat.id, tg, text);
  }
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const upd = await req.json().catch(() => null);
  if (!upd) return new Response("ok");
  try { await handle(upd); } catch (e) { console.error("bot:", e); }
  return new Response("ok");
});
