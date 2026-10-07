"use client";

import { useEffect, useState } from "react";

import type { AiUsageDashboard } from "@workspace/contracts";
import { Button } from "@workspace/ui/components/Button";

import {
  getAiUsageDashboard,
  saveAiBalanceBaseline,
} from "#/libs/worker-client";

import { AiUsagePanel } from "./AiUsagePanel";

export default function AiUsageClient() {
  const [data, setData] = useState<AiUsageDashboard | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setError(null);
    setLoading(true);
    void getAiUsageDashboard(days)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "사용량을 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [days, refresh]);
  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">AI 사용량과 비용</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Career Ops에서 기록한 호출 기준입니다. 다른 프로젝트의 비용은
            포함되지 않습니다.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setRefresh((value) => value + 1)}
        >
          새로고침
        </Button>
      </div>
      <label className="flex items-center gap-3 text-sm">
        조회 기간
        <select
          className="border-border bg-background rounded-md border p-2"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          <option value={7}>최근 7일</option>
          <option value={30}>최근 30일</option>
          <option value={90}>최근 90일</option>
        </select>
      </label>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">사용량을 불러오는 중입니다.</p> : null}
      {!data ? (
        !loading && !error ? (
          <p>기록이 없습니다.</p>
        ) : null
      ) : (
        <AiUsagePanel
          data={data}
          pending={pending || loading}
          onSave={async (input) => {
            setPending(true);
            setError(null);
            try {
              await saveAiBalanceBaseline(input);
              setRefresh((value) => value + 1);
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "잔액 기준을 저장하지 못했습니다.",
              );
            } finally {
              setPending(false);
            }
          }}
        />
      )}
    </section>
  );
}
