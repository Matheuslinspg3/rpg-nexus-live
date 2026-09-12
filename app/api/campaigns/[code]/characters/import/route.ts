import { requireUser, db } from "@/lib/api-helpers";
import { getNimbleLayout, isNimbleLayout } from "../../../../../nimbleLayouts";
import { PDFDocument } from 'pdf-lib';

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 64) : "";
}

function getPdfFields(pdfBytes: Uint8Array) {
  return PDFDocument.load(pdfBytes).then(pdfDoc => {
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const map: Record<string, string | boolean> = {};
    fields.forEach(field => {
      const type = field.constructor.name;
      const name = field.getName();
      let val: string | boolean = '';
      try {
          if (type === 'PDFTextField') val = (field as any).getText() ?? '';
          else if (type === 'PDFCheckBox') val = (field as any).isChecked() ?? false;
      } catch(e) {}
      map[name] = val;
    });
    return map;
  });
}

function detectLayoutId(fields: Record<string, string | boolean>): string {
  // If we can find the name of the layout in the field names, we can figure it out
  for (const key of Object.keys(fields)) {
    if (key.includes("Shadowmancer")) return "SHADOWMANCER";
    if (key.includes("Berserker")) return "BERSERKER";
    if (key.includes("Commander")) return "COMMANDER";
    if (key.includes("Hexbinder")) return "HEXBINDER";
    if (key.includes("Hunter")) return "HUNTER";
    if (key.includes("Mage")) return "MAGE";
    if (key.includes("Oathsworn")) return "OATHSWORN";
    if (key.includes("Shepherd")) return "SHEPHERD";
    if (key.includes("Songweaver")) return "SONGWEAVER";
    if (key.includes("Stormshifter")) return "STORMSHIFTER";
    if (key.includes("The Cheat") || key.includes("Cheat")) return "THE_CHEAT";
    if (key.includes("Zephyr")) return "ZEPHYR";
  }
  return "BASE";
}

function parseFieldsMapping(pdfFields: Record<string, string | boolean>, layoutId: string) {
    const fields: Record<string, string> = {};
    // Extracting layout suffix. e.g. " Shadowmancer"
    const layoutSuffix = layoutId !== "BASE" ? Object.keys(pdfFields).find(k => k.startsWith("hero 1 "))?.replace("hero 1", "") || "" : "";

    function getStr(name: string) {
        let val = pdfFields[`${name}${layoutSuffix}`];
        if (val === undefined) val = pdfFields[name];
        return val ? String(val) : '';
    }

    const hero1 = getStr('hero 1');
    const heroParts = hero1.split(',');
    fields.characterName = heroParts[0]?.trim() || 'Desconhecido';
    fields.ancestryClassLevel = heroParts[1]?.trim() ? `${heroParts[1].trim()}${heroParts[2] ? ', ' + heroParts[2].trim() : ''}` : '';

    fields.str = getStr('STR_value');
    fields.dex = getStr('DEX_value');
    fields.int = getStr('INT_value');
    fields.wil = getStr('WIL_value');
    fields.arcana = getStr('arcana');
    fields.examination = getStr('examination');
    fields.finesse = getStr('finesse');
    fields.influence = getStr('influence');
    fields.insight = getStr('insight');
    fields.lore = getStr('lore');
    fields.might = getStr('might');
    fields.naturecraft = getStr('naturecraft');
    fields.perception = getStr('perception');
    fields.stealth = getStr('stealth');
    fields.level = getStr('level');
    fields.subclass = getStr('sublcass');
    fields.proficiencies = getStr('prof');
    fields.size = getStr('size');
    fields.speed = getStr('speed');
    fields.initiative = getStr('init');
    fields.armor = getStr('defense');
    fields.hitDice = getStr('HD current');
    fields.tempHp = getStr('HP temp');
    fields.hpCurrent = getStr('HP current');
    fields.hpMax = getStr('HP max');
    fields.classResource1Current = getStr('mana current');
    fields.classResource1Max = getStr('mana max');
    fields.spellTier = getStr('spell tier');
    fields.features = getStr('reactions and utility');
    fields.spells = getStr('actions and attacks');
    fields.notes = [getStr('hero 2'), getStr('hero 3'), getStr('hero 4'), getStr('hero 5')].filter(Boolean).join('\n');

    // Wounds
    const woundsStr = getStr('wounds current');
    const woundsNum = parseInt(woundsStr, 10);
    if (!isNaN(woundsNum)) {
      for (let i = 1; i <= 5; i++) {
        fields[`wound${i}`] = i <= woundsNum ? "true" : "false";
      }
    }

    // Inventory
    let inventory = [];
    for(let i=1; i<=20; i++) {
      const item = getStr(`inventory ${i}`);
      if(item) inventory.push(item);
    }
    if (inventory.length > 0) {
      fields.notes = (fields.notes ? fields.notes + '\n\n' : '') + 'Inventário:\n' + inventory.join('\n');
    }

    return fields;
}


export async function POST(request: Request, context: Context) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Entre para continuar." }, { status: 401 });

  const { code: rawCode } = await context.params;
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) return Response.json({ error: "Arquivo PDF inválido." }, { status: 400 });

  const supabase = db();
  const { data: membership, error: meError } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", rawCode.toUpperCase())
    .eq("campaign_members.email", user.email)
    .single();

  if (meError || !membership) return Response.json({ error: "Acesso negado." }, { status: 403 });
  const role = (membership.campaign_members as any[])[0].role;
  if (role !== "master") return Response.json({ error: "Apenas o Mestre pode criar fichas." }, { status: 403 });

  let pdfFieldsMap;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    pdfFieldsMap = await getPdfFields(bytes);
  } catch (err) {
    return Response.json({ error: "Não foi possível ler o arquivo PDF." }, { status: 400 });
  }

  const layoutIdStr = detectLayoutId(pdfFieldsMap);
  const layoutId = isNimbleLayout(layoutIdStr) ? layoutIdStr : "BASE";
  const mappedFields = parseFieldsMapping(pdfFieldsMap, layoutId);
  const name = cleanName(mappedFields.characterName || "Nova Ficha");

  const campaignId = membership.id as string;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: charError } = await supabase.from("characters").insert({
    id,
    campaign_id: campaignId,
    name,
    assigned_user_id: null,
    created_by: user.email,
    created_at: now,
    updated_at: now,
  });

  if (charError) {
    return Response.json({ error: "Falha ao criar ficha no banco de dados." }, { status: 500 });
  }

  const fieldRows = [
    { character_id: id, campaign_id: campaignId, field_key: "classLayout", field_value: layoutId, updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
    { character_id: id, campaign_id: campaignId, field_key: "proficiencies", field_value: mappedFields.proficiencies || getNimbleLayout(layoutId).proficiencies, updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
    { character_id: id, campaign_id: campaignId, field_key: "classFeatures", field_value: "[]", updated_by: user.email, updated_by_name: user.displayName, updated_at: now },
  ];

  for (const [k, v] of Object.entries(mappedFields)) {
    if (k === "characterName" || k === "proficiencies") continue; // Handled specially
    if (!v) continue;
    fieldRows.push({
      character_id: id,
      campaign_id: campaignId,
      field_key: k,
      field_value: v,
      updated_by: user.email,
      updated_by_name: user.displayName,
      updated_at: now
    });
  }

  const { error: fieldsError } = await supabase.from("character_fields").insert(fieldRows);
  if (fieldsError) {
    await supabase.from("characters").delete().eq("id", id);
    return Response.json({ error: "Falha ao salvar os atributos da ficha." }, { status: 500 });
  }

  const { data: current } = await supabase.from("campaigns").select("version").eq("id", campaignId).single();
  await supabase
    .from("campaigns")
    .update({ version: (current?.version ?? 0) + 1, updated_at: now })
    .eq("id", campaignId);

  return Response.json(
    { character: { id, name, assignedUserId: null, assignedDisplayName: null, updatedAt: now } },
    { status: 201 },
  );
}
