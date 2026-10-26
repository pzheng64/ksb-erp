"use client";

import { useEffect, useState } from "react";
import { Banner, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { clock, todayInput } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

function timeInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const slice = String(value).slice(11, 16);
    return slice.length === 5 && slice[2] === ":" ? slice : "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return hours + ":" + minutes;
}

type EditState = { mode: "one" | "bulk"; employeeIds: number[]; clock_in: string; clock_out: string; name?: string };
