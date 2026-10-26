export default function AttendancePage() {
  const { t } = useText();
  const { has, me, options } = useSession();
  const canWrite = has("employees.write");
  const [day, setDay] = useState(todayInput);
  const [unitId, setUnitId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

  async function reload(nextDay = day, nextUnit = unitId) {
    const params = new URLSearchParams({ work_date: nextDay });
    if (nextUnit) params.set("unit_id", nextUnit);
    const result = await api<{ items: Row[] }>("/employees/attendance?" + params.toString());
    setRows(result.items);
    setSelected([]);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load attendance"));
  }, []);

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.employee_id));
  const openDay = day === todayInput();

  async function punch(employeeId: number) {
    setError(null);
    try {
      await api("/employees/attendance/clock", { method: "POST", body: JSON.stringify({ employee_id: employeeId }) });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Clock failed");
    }
  }

  async function bulkMark(status: "leave" | "absent") {
    if (!selected.length) return;
    const labelText = status === "leave" ? t("attendance.leave") : t("attendance.absent");
    if (!confirm(t("attendance.bulkMarkConfirm", { count: selected.length, status: labelText, day }))) return;
    setBusy(true);
    setError(null);
    try {
      for (const employeeId of selected) {
        await api("/employees/attendance/mark", {
          method: "POST",
          body: JSON.stringify({ employee_id: employeeId, work_date: day, status }),
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("attendance.markFailed"));
    } finally {
      setBusy(false);
    }
  }

  function openEditOne(row: Row) {
    setEdit({
      mode: "one",
      employeeIds: [row.employee_id],
      clock_in: timeInputValue(row.clock_in),
      clock_out: timeInputValue(row.clock_out),
      name: row.full_name,
    });
  }

  function openEditBulk() {
    if (!selected.length) return;
    setEdit({ mode: "bulk", employeeIds: selected, clock_in: "09:00", clock_out: "17:30" });
  }

  async function saveTimes() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      if (edit.mode === "one") {
        await api("/employees/attendance/set", {
          method: "POST",
          body: JSON.stringify({
            employee_id: edit.employeeIds[0],
            work_date: day,
            clock_in: edit.clock_in || null,
            clock_out: edit.clock_out || null,
            clear: false,
          }),
        });
      } else {
        await api("/employees/attendance/bulk-set", {
          method: "POST",
          body: JSON.stringify({
            employee_ids: edit.employeeIds,
            work_date: day,
            clock_in: edit.clock_in || null,
            clock_out: edit.clock_out || null,
            clear: false,
          }),
        });
      }
      setEdit(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("attendance.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function revertTimes(employeeIds?: number[]) {
    const ids = employeeIds || edit?.employeeIds || [];
    if (!ids.length) return;
    if (!confirm(t("attendance.revertConfirm", { count: ids.length }))) return;
    setBusy(true);
    setError(null);
    try {
      if (ids.length === 1) {
        await api("/employees/attendance/set", {
          method: "POST",
          body: JSON.stringify({ employee_id: ids[0], work_date: day, clear: true }),
        });
      } else {
        await api("/employees/attendance/bulk-set", {
          method: "POST",
          body: JSON.stringify({ employee_ids: ids, work_date: day, clear: true }),
        });
      }
      setEdit(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("attendance.revertFailed"));
    } finally {
      setBusy(false);
    }
  }
