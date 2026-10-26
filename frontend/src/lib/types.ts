export type Ref = { id: number; name: string; code?: string };

export type Me = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  phone?: string | null;
  status: string;
  unit?: Ref | null;
  department?: Ref | null;
  position?: Ref | null;
  roles: Ref[];
  permissions: string[];
  pending_users?: number | null;
  employee?: { id: number; employee_no: string; full_name: string; status: string } | null;
};

export type Options = {
  company?: { id: number; name: string } | null;
  units: { id: number; name: string; code?: string; kind?: string }[];
  departments: { id: number; name: string; code?: string; unit_id: number; unit_name?: string }[];
  positions: Ref[];
  locations: { id: number; name: string; kind: string; unit_id: number; unit_name?: string }[];
  goods: { id: number; name: string; sku: string; uom: string; currency: string; unit_price: number; category: string; purchased_from?: string | null }[];
  goods_types: (Ref & { is_active?: boolean })[];
  purchase_sources: Ref[];
  vehicles: { id: number; plate_no: string; kind: string; status: string; odometer_km: number; driver_employee_id?: number | null }[];
  people: { id: number; full_name: string; username: string }[];
  employees: { id: number; full_name: string; employee_no: string; status: string }[];
  roles: Ref[];
  permissions: { id: number; code: string; name: string; module: string }[];
};

export const emptyOptions: Options = {
  units: [],
  departments: [],
  positions: [],
  locations: [],
  goods: [],
  goods_types: [],
  purchase_sources: [],
  vehicles: [],
  people: [],
  employees: [],
  roles: [],
  permissions: [],
};

export type Page<T> = { items: T[]; total: number };
export type Row = Record<string, any>;
