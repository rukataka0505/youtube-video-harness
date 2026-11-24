import type { PlanEAuditReport } from './audit';

export class PlanEAnchorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanEAnchorError';
  }
}

/** 自由舞台の `ctx.media(key)` が素材マニフェスト外のキーを引いたときの事故エラー。 */
export class PlanEMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanEMediaError';
  }
}

export class PlanEAuditError extends Error {
  readonly report: PlanEAuditReport;

  constructor(report: PlanEAuditReport) {
    const summary = report.errors.map((e) => `${e.code}: ${e.message}`).join('\n  - ');
    super(`Plan E audit failed (${report.errors.length} error(s)):\n  - ${summary}`);
    this.name = 'PlanEAuditError';
    this.report = report;
  }
}
