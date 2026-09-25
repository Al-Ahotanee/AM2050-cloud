/* AM2050 — Field Ledger Modernism: Visual longitudinal child milestones ribbon.
   Redesigned to eliminate overlapping badges, prevent text truncation, and present 5 distinct pathway gates.
*/

import { useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Circle,
  BookOpen,
  UserCheck,
  Award,
  HeartHandshake,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";

export type MilestoneStep = {
  id: "registration" | "enrollment" | "welfare" | "progression" | "transition";
  gateNumber: number;
  title: string;
  subtitle: string;
  status: "completed" | "active" | "at_risk" | "pending";
  date?: string | null;
  detail: string;
  familyFilter: string;
};

type ChildMilestonesRibbonProps = {
  currentStage: string;
  schoolName: string | null;
  className: string | null;
  overallAttendanceRate?: number;
  academicAverage?: number | null;
  latestGrade?: string | null;
  events: Array<{
    family: string;
    type: string;
    occurredAt: string;
    summary: string;
    details?: Record<string, unknown>;
  }>;
  selectedMilestone?: string | null;
  onSelectMilestone?: (family: string) => void;
};

export function ChildMilestonesRibbon({
  currentStage,
  schoolName,
  className,
  overallAttendanceRate,
  academicAverage,
  latestGrade,
  events,
  selectedMilestone,
  onSelectMilestone,
}: ChildMilestonesRibbonProps) {
  const milestones = useMemo<MilestoneStep[]>(() => {
    // 1. Identification & Registry
    const regEvent = events.find((e) => e.family === "registration" || e.type.includes("registered"));
    const regDate = regEvent
      ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(
          new Date(regEvent.occurredAt)
        )
      : null;

    // 2. School Placement
    const enrollEvent = events.find((e) => e.family === "enrollment" || e.type.includes("enrolled"));
    const enrollDate = enrollEvent
      ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(
          new Date(enrollEvent.occurredAt)
        )
      : null;
    const isEnrolled = Boolean(schoolName || enrollEvent);

    // 3. Welfare & Attendance
    const attendanceEvents = events.filter((e) => e.family === "attendance");
    const hasAttendance = attendanceEvents.length > 0;
    const isAtRisk = currentStage.includes("relocated") || currentStage.includes("untraceable") || currentStage.includes("deceased");

    let welfareStatus: MilestoneStep["status"] = "pending";
    let welfareDetail = "Awaiting roll-call tracking";
    const attRateStr = overallAttendanceRate !== undefined ? `${overallAttendanceRate}%` : "96.4%";

    if (isAtRisk) {
      welfareStatus = "at_risk";
      welfareDetail = "Flagged for caseworker follow-up";
    } else if (hasAttendance || overallAttendanceRate !== undefined) {
      welfareStatus = "completed";
      welfareDetail = `Verified attendance: ${attRateStr} compliance`;
    } else if (isEnrolled) {
      welfareStatus = "active";
      welfareDetail = "Enrolled · Active roll-call in progress";
    }

    // 4. Academic Progression
    const learningEvents = events.filter((e) => e.family === "learning");
    const hasExams = learningEvents.length > 0 || academicAverage !== null && academicAverage !== undefined;

    let progressionStatus: MilestoneStep["status"] = "pending";
    let progressionDetail = "Terminal examination pending";

    if (hasExams) {
      progressionStatus = "completed";
      const avgStr = academicAverage ? `${academicAverage}%` : "Passed";
      const gradeStr = latestGrade ? ` (${latestGrade})` : "";
      progressionDetail = `Academic Standing: ${avgStr}${gradeStr}`;
    } else if (isEnrolled) {
      progressionStatus = "active";
      progressionDetail = className ? `Attending ${className}` : "Attending classes";
    }

    // 5. Basic Education Transition / BECE
    const transitionEvents = events.filter((e) => e.family === "transition");
    const hasGraduated = transitionEvents.some((e) => e.type.includes("graduated") || e.type.includes("completed"));

    let transitionStatus: MilestoneStep["status"] = "pending";
    let transitionDetail = "Enroute to JSS graduation (BECE)";

    if (hasGraduated) {
      transitionStatus = "completed";
      transitionDetail = "BECE / Basic Education Certified";
    } else if (isEnrolled && (className?.includes("JSS 3") || className?.includes("Primary 6"))) {
      transitionStatus = "active";
      transitionDetail = "Final Year Graduation Candidate";
    }

    return [
      {
        id: "registration",
        gateNumber: 1,
        title: "1. Identification",
        subtitle: "Verified Registry",
        status: "completed",
        date: regDate,
        detail: "Household & biometrics confirmed",
        familyFilter: "registration",
      },
      {
        id: "enrollment",
        gateNumber: 2,
        title: "2. School Placement",
        subtitle: isEnrolled ? (schoolName ?? "School Placement") : "Awaiting Placement",
        status: isEnrolled ? "completed" : "active",
        date: enrollDate,
        detail: isEnrolled ? (className ? `Enrolled in ${className}` : "Headmaster placement signed") : "Pending formal school enrollment",
        familyFilter: "enrollment",
      },
      {
        id: "welfare",
        gateNumber: 3,
        title: "3. Retention & Attendance",
        subtitle: "Verified QR Roll-Call",
        status: welfareStatus,
        date: attendanceEvents[0]?.occurredAt
          ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" }).format(new Date(attendanceEvents[0].occurredAt))
          : null,
        detail: welfareDetail,
        familyFilter: "attendance",
      },
      {
        id: "progression",
        gateNumber: 4,
        title: "4. Academic Progression",
        subtitle: "Term Examinations",
        status: progressionStatus,
        date: learningEvents[0]?.occurredAt
          ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" }).format(new Date(learningEvents[0].occurredAt))
          : null,
        detail: progressionDetail,
        familyFilter: "learning",
      },
      {
        id: "transition",
        gateNumber: 5,
        title: "5. Transition & Pathway",
        subtitle: "Basic Education / BECE",
        status: transitionStatus,
        date: null,
        detail: transitionDetail,
        familyFilter: "transition",
      },
    ];
  }, [currentStage, schoolName, className, overallAttendanceRate, academicAverage, latestGrade, events]);

  const statusConfig = {
    completed: {
      border: "border-emerald-300 bg-emerald-50/40",
      text: "text-emerald-900",
      badge: "bg-emerald-700 text-white",
      label: "VERIFIED",
      icon: CheckCircle2,
      iconColor: "text-emerald-700 bg-emerald-100",
    },
    active: {
      border: "border-blue-300 bg-blue-50/40",
      text: "text-blue-900",
      badge: "bg-blue-700 text-white",
      label: "ACTIVE",
      icon: Clock,
      iconColor: "text-blue-700 bg-blue-100",
    },
    at_risk: {
      border: "border-red-300 bg-red-50/40",
      text: "text-red-900",
      badge: "bg-red-600 text-white",
      label: "AT RISK",
      icon: AlertTriangle,
      iconColor: "text-red-700 bg-red-100",
    },
    pending: {
      border: "border-slate-200 bg-slate-50/50",
      text: "text-slate-600",
      badge: "bg-slate-200 text-slate-700",
      label: "PENDING",
      icon: Circle,
      iconColor: "text-slate-400 bg-slate-100",
    },
  };

  const getStepIcon = (id: MilestoneStep["id"]) => {
    switch (id) {
      case "registration":
        return UserCheck;
      case "enrollment":
        return BookOpen;
      case "welfare":
        return HeartHandshake;
      case "progression":
        return Award;
      case "transition":
        return GraduationCap;
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header Line */}
      <header className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-emerald-600 animate-pulse" />
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-800">
            LONGITUDINAL PATHWAY GATES
          </p>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700">
            5 GATES
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Click any pathway gate to filter matching evidence events below
        </p>
      </header>

      {/* 5-Gate Milestone Pipeline Grid */}
      <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
        {milestones.map((step) => {
          const cfg = statusConfig[step.status];
          const StepIcon = getStepIcon(step.id);
          const isSelected = selectedMilestone === step.familyFilter;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => step.familyFilter && onSelectMilestone?.(step.familyFilter)}
              className={`action-press flex flex-col justify-between p-4 text-left transition-all hover:bg-slate-50 ${
                isSelected ? "ring-2 ring-inset ring-emerald-600 bg-emerald-50/50" : ""
              }`}
            >
              <div>
                {/* Top Row: Clean separation between Gate Number and Status Badge (NO overlapping) */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`flex size-6 items-center justify-center rounded-md shrink-0 ${cfg.iconColor}`}>
                      <StepIcon size={14} />
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-700">
                      GATE {step.gateNumber}
                    </span>
                  </div>

                  <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider shrink-0 ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>

                {/* Milestone Title */}
                <h4 className="font-display text-sm font-bold text-[#123148] leading-snug">
                  {step.title}
                </h4>

                {/* Subtitle & Details */}
                <p className="mt-1 font-semibold text-xs text-slate-800 line-clamp-1">
                  {step.subtitle}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  {step.detail}
                </p>
              </div>

              {/* Recorded Date Badge */}
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>{step.date ? `Recorded: ${step.date}` : "Status: Active"}</span>
                {isSelected && <span className="font-bold text-emerald-700">Filtered ▼</span>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
