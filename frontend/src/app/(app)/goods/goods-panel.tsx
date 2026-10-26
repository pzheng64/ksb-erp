"use client";

import { num } from "@/lib/format";
import { Term } from "@/lib/i18n";
import { Row } from "@/lib/types";
import { GoodsPreviewLink } from "@/components/goods-preview";

export function GoodsLink({ goodsId, name, className = "" }: { goodsId: number; name: string; className?: string }) {
  return (
    <GoodsPreviewLink href={`/goods/${goodsId}`} cacheKey={`goods-${goodsId}`} name={name} className={className} loadPath={`/goods/${goodsId}`}>
      {(row) => <GoodsPreview row={row} />}
    </GoodsPreviewLink>
  );
}

function GoodsPreview({ row }: { row: Row }) {
  const places: { location_id?: number; name?: string | null; unit_name?: string | null; on_hand?: number }[] = row.warehouses || [];
  return (
    <>
      <span className="block font-serif text-lg leading-tight">{row.name}</span>
      <span className="mt-0.5 block text-xs text-ink/50">{row.sku}</span>
      <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <span className="text-ink/45">Use</span>
        <span>
          <Term prefix="category" value={row.category} />
        </span>
        <span className="text-ink/45">On hand</span>
        <span>
          {num(row.on_hand)} {row.uom || ""}
        </span>
      </span>
      <span className="mt-2 block text-xs text-ink/55">
        In {num(row.received)} · Out {num(row.issued)}
      </span>
      <span className="mt-2 block border-t border-line pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink/45">Warehouse</span>
      <span className="mt-1 block text-sm">
        {(places.length ? places : [{ name: null, on_hand: row.on_hand }]).map((place, index) => {
          const label = place.name ? (place.unit_name ? `${place.name} · ${place.unit_name}` : place.name) : "No warehouse";
          return (
            <span key={place.location_id ?? index} className="flex justify-between gap-3 py-0.5">
              <span>{label}</span>
              <span className="text-ink/70">
                {num(place.on_hand)} {row.uom || ""}
              </span>
            </span>
          );
        })}
      </span>
    </>
  );
}
