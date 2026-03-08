const BUILTIN_ONTOLOGY_SEED_PROFILES = Object.freeze({
  'customer-order-demo': {
    profile: 'customer-order-demo',
    label: 'Customer Order Demo',
    description: 'Starter triad for customer + order + inventory demo app.',
    er: [
      {
        entity_id: 'Customer',
        name: 'Customer',
        display_name: '客户',
        description: 'Customer master entity for order lifecycle.',
        status: 'active',
        key_fields: ['customer_id', 'name', 'status'],
        relations: [{ target: 'Order', relation_type: 'one_to_many', cardinality: '1..n' }],
        domain_scope: 'customer-order-demo',
        risk_level: 'low'
      },
      {
        entity_id: 'Order',
        name: 'Order',
        display_name: '订单',
        description: 'Order aggregate linking customer, line items, and fulfillment state.',
        status: 'active',
        key_fields: ['order_id', 'customer_id', 'status'],
        relations: [
          { target: 'Customer', relation_type: 'many_to_one', cardinality: 'n..1' },
          { target: 'InventoryItem', relation_type: 'many_to_many', cardinality: 'n..n' }
        ],
        domain_scope: 'customer-order-demo',
        risk_level: 'medium'
      },
      {
        entity_id: 'InventoryItem',
        name: 'InventoryItem',
        display_name: '库存项',
        description: 'Inventory item tracked during reservation and fulfillment.',
        status: 'active',
        key_fields: ['inventory_item_id', 'sku', 'available_qty'],
        relations: [{ target: 'Order', relation_type: 'many_to_many', cardinality: 'n..n' }],
        domain_scope: 'customer-order-demo',
        risk_level: 'medium'
      }
    ],
    br: [
      {
        rule_id: 'BR-ORDER-001',
        title: '订单提交前必须完成库存可用性检查',
        scope: '订单提交',
        rule_type: 'validation',
        condition: '订单进入提交或确认阶段前',
        consequence: '必须校验所有明细对应库存项的可用数量',
        severity: 'high',
        status: 'active',
        entity_refs: ['Order', 'InventoryItem']
      },
      {
        rule_id: 'BR-ORDER-002',
        title: '客户状态异常时不得进入订单确认',
        scope: '订单确认',
        rule_type: 'governance',
        condition: '客户状态不是 active',
        consequence: '订单确认流程必须阻断并记录问题项',
        severity: 'blocking',
        status: 'active',
        entity_refs: ['Customer', 'Order']
      }
    ],
    dl: [
      {
        chain_id: 'DL-ORDER-001',
        title: '客户下单到库存确认决策链路',
        description: 'Normalize customer/order/inventory checks before order confirmation.',
        trigger: '新建订单并进入确认前校验',
        decision_nodes: [
          { order: 1, name: '校验客户状态', description: '确认客户可下单' },
          { order: 2, name: '校验库存可用性', description: '确认库存数量足够' },
          { order: 3, name: '生成确认动作', description: '输出确认或阻断结果' }
        ],
        outputs: ['order.confirmation_decision', 'inventory.reservation_action'],
        status: 'active',
        entity_refs: ['Customer', 'Order', 'InventoryItem'],
        rule_refs: ['BR-ORDER-001', 'BR-ORDER-002'],
        risk_level: 'medium'
      }
    ]
  },
  demo: {
    alias_of: 'customer-order-demo'
  }
});

function normalizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function resolveOntologySeedProfile(profileCandidate = '') {
  const normalized = normalizeString(profileCandidate).toLowerCase();
  if (!normalized) {
    return null;
  }
  const direct = BUILTIN_ONTOLOGY_SEED_PROFILES[normalized];
  if (!direct) {
    return null;
  }
  if (direct.alias_of) {
    return BUILTIN_ONTOLOGY_SEED_PROFILES[direct.alias_of] || null;
  }
  return direct;
}

function listOntologySeedProfiles() {
  return Object.entries(BUILTIN_ONTOLOGY_SEED_PROFILES)
    .filter(([, value]) => !value.alias_of)
    .map(([key, value]) => ({
      profile: key,
      label: value.label,
      description: value.description,
      er_count: Array.isArray(value.er) ? value.er.length : 0,
      br_count: Array.isArray(value.br) ? value.br.length : 0,
      dl_count: Array.isArray(value.dl) ? value.dl.length : 0
    }));
}

async function applyOntologySeedProfile(profileCandidate, store) {
  const profile = resolveOntologySeedProfile(profileCandidate);
  if (!profile) {
    throw new Error(`ontology seed profile not found: ${profileCandidate}`);
  }
  const written = {
    er: [],
    br: [],
    dl: []
  };
  for (const item of profile.er || []) {
    written.er.push(await store.upsertOntologyErAsset(item));
  }
  for (const item of profile.br || []) {
    written.br.push(await store.upsertOntologyBrRule(item));
  }
  for (const item of profile.dl || []) {
    written.dl.push(await store.upsertOntologyDlChain(item));
  }
  const triad = await store.buildOntologyTriadSummary({ limit: 1000 });
  return {
    profile: profile.profile,
    label: profile.label,
    written,
    triad
  };
}

module.exports = {
  BUILTIN_ONTOLOGY_SEED_PROFILES,
  resolveOntologySeedProfile,
  listOntologySeedProfiles,
  applyOntologySeedProfile
};
