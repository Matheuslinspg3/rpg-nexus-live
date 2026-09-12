function getFieldsFromPdf(pdfFields: Record<string, string>, layoutId: string) {
    const fields: Record<string, string> = {};

    function getStr(name: string) {
        return pdfFields[`${name} ${layoutId}`] || pdfFields[name] || '';
    }

    const hero1 = getStr('hero 1');
    const heroParts = hero1.split(',');
    fields.characterName = heroParts[0]?.trim() || '';

    // Some basic mapping...
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
    fields.notes = getStr('hero 2') + getStr('hero 3') + getStr('hero 4') + getStr('hero 5');

    // Wounds
    const woundsStr = getStr('wounds current');
    const woundsNum = parseInt(woundsStr, 10);
    if (!isNaN(woundsNum)) {
      for (let i = 1; i <= 5; i++) {
        fields[`wound${i}`] = i <= woundsNum ? "true" : "false";
      }
    }

    // Selected Features
    const selectedFeatures: string[] = [];
    // Features mapping is tricky as we just have 'class feat X' boolean, we'll need to know which is which.
    // Given the difficulty, we might skip features or map them based on layout.

    // Inventory
    let inventory = [];
    for(let i=1; i<=20; i++) {
      const item = getStr(`inventory ${i}`);
      if(item) {
         inventory.push(item);
      }
    }
    fields.notes = fields.notes + '\n\nInventory:\n' + inventory.join('\n');

    return fields;
}
