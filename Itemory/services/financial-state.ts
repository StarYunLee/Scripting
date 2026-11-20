import type { ItemExitRecord, ItemRecord, MoneyEntryRecord } from "../models/types";
import { calculateCostSummary } from "../domain/cost";

export interface FinancialState {
  item: ItemRecord;
  money: MoneyEntryRecord[];
  exit: ItemExitRecord | null;
}

export async function loadFinancialState(db: SQLite.Database, itemId: string): Promise<FinancialState> {
  const itemRows=await db.fetchAll<any>("SELECT * FROM items WHERE id=?",[itemId]); const r=itemRows[0];
  if(!r)throw new Error("物品不存在");
  const item:ItemRecord={id:r.id,name:r.name,categoryId:r.category_id,acquiredOn:r.acquired_on,acquisitionAmountMinor:r.acquisition_amount_minor,holdingCondition:r.holding_condition,iconSymbol:r.icon_symbol,coverAssetId:r.cover_asset_id,channel:r.channel,warrantyUntil:r.warranty_until,valuationMinor:r.valuation_minor,notes:r.notes,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at};
  const money=(await db.fetchAll<any>("SELECT * FROM money_entries WHERE item_id=?",[itemId])).map((m):MoneyEntryRecord=>({id:m.id,itemId:m.item_id,direction:m.direction,kind:m.kind,amountMinor:m.amount_minor,occurredOn:m.occurred_on,title:m.title,note:m.note,createdAt:m.created_at,updatedAt:m.updated_at}));
  const x=(await db.fetchAll<any>("SELECT * FROM item_exits WHERE item_id=?",[itemId]))[0];
  const exit:ItemExitRecord|null=x?{itemId:x.item_id,reason:x.reason,exitedOn:x.exited_on,recoveryAmountMinor:x.recovery_amount_minor,note:x.note,createdAt:x.created_at,updatedAt:x.updated_at}:null;
  return {item,money,exit};
}

export function assertFinancialState(state: FinancialState): void {
  calculateCostSummary(state.item,state.money,state.exit);
}

export function assertItemFinancialCandidate(state: FinancialState, item: ItemRecord): void {
  assertFinancialState({ ...state, item });
}

export function assertMoneyFinancialCandidate(state: FinancialState, next: MoneyEntryRecord | null, removeId?: string): void {
  const money = state.money.filter(entry => entry.id !== (removeId ?? next?.id));
  if (next) money.push(next);
  assertFinancialState({ ...state, money });
}

export function assertExitFinancialCandidate(state: FinancialState, exit: ItemExitRecord | null): void {
  assertFinancialState({ ...state, exit });
}
