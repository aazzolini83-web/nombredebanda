import { getStore } from "@netlify/blobs";
const PEOPLE = ["Alberto", "Facundo", "Pedro", "Daniel"];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
async function read(store, key, fallback) { try { return (await store.get(key, { type: "json", consistency: "strong" })) ?? fallback; } catch { return fallback; } }
async function fullState(store) {
  const custom = [], votes = {}, battle = {};
  for (const person of PEOPLE) {
    custom.push(...await read(store, `names-${person}`, []));
    const vote = await read(store, `vote-${person}`, null);
    if (vote) votes[person] = vote;
    battle[person] = await read(store, `battle-${person}`, {});
  }
  return { custom, votes, battle };
}
export default async (req) => {
  const store = getStore("band-name-battle");
  if (req.method === "GET") return json(await fullState(store));
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const body = await req.json();
    if (body.action === "reset") {
      for (const person of PEOPLE) {
        await store.setJSON(`names-${person}`, []);
        await store.setJSON(`vote-${person}`, null);
        await store.setJSON(`battle-${person}`, {});
      }
      return json(await fullState(store));
    }
    if (!PEOPLE.includes(body.person)) return json({ error: "Participante no válido" }, 400);
    if (body.action === "addName") {
      const name = String(body.name || "").trim().slice(0, 45);
      if (!name) return json({ error: "Nombre vacío" }, 400);
      const key = `names-${body.person}`, names = await read(store, key, []);
      if (!names.some(x => x.name.toLowerCase() === name.toLowerCase())) names.push({ id: `x-${body.person.toLowerCase()}-${Date.now()}`, author: body.person, name });
      await store.setJSON(key, names); return json(await fullState(store));
    }
    if (body.action === "removeName") {
      const key = `names-${body.person}`, names = await read(store, key, []);
      await store.setJSON(key, names.filter(x => x.id !== body.id)); return json(await fullState(store));
    }
    if (body.action === "vote") {
      const clean = {};
      for (const [id, value] of Object.entries(body.scores || {})) { const n = Number(value); if (Number.isInteger(n) && n >= 0 && n <= 5) clean[String(id).slice(0, 80)] = n; }
      await store.setJSON(`vote-${body.person}`, { scores: clean, at: new Date().toISOString() }); return json(await fullState(store));
    }
    if (body.action === "battleVote") {
      if (!["qf", "sf", "final"].includes(body.round)) return json({ error: "Ronda no válida" }, 400);
      const choices = {};
      for (const [match, id] of Object.entries(body.choices || {})) choices[String(match).slice(0, 30)] = String(id).slice(0, 80);
      const key = `battle-${body.person}`, battle = await read(store, key, {});
      battle[body.round] = { choices, at: new Date().toISOString() };
      await store.setJSON(key, battle); return json(await fullState(store));
    }
    return json({ error: "Acción no válida" }, 400);
  } catch (error) { console.error(error); return json({ error: "Error interno" }, 500); }
};
export const config = { path: "/.netlify/functions/state" };
