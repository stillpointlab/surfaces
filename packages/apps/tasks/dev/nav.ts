// The tab strip in the harness: its states (this repository's own docs/tasks/
// nav, built with the core's functions, and a hand-built one with every
// control), and an in-memory host that answers its ops against the nav it
// shows. Creating, pointing and closing change that nav and hand it back, as a
// host's page would after it navigates or reloads; the requests themselves
// (navigate, reload-request) show in the event log.
import { answerOps, fail, ok } from '@stillpointlab/common-format/app';

import { projectTasksNav } from '../src/index.js';

import { repoSnapshot } from './repo.js';

import type { TaskBoard, TasksNav, TasksNavOps, TasksNavState } from '../src/element/index.js';
import type { SharedTasksNav } from '../src/index.js';
import type { AppOp, Result } from '@stillpointlab/common-format/app';

/** This repository's nav, on the phase `current:` points at. */
export function repoNav(): TasksNavState | null {
  const projected = projectTasksNav(repoSnapshot());
  if (!projected) return null;
  const { currentPointer, currentPointerPath } = projected;
  const on = currentPointerPath !== null ? currentPointer : null;
  return {
    ...projected,
    current: {
      stage: on?.stage ?? null,
      phase: on?.phase ?? null,
      other: false,
      boardPath: currentPointerPath ?? '',
    },
  };
}

/** Two stages, a board outside them, the pointer on stage 1 phase 1. */
export function handNav(
  current: { stage: number | null; phase: number | null } = { stage: 1, phase: 1 }
): TasksNavState {
  return {
    nav: {
      stages: [
        {
          stage: 1,
          phases: [
            { phase: 1, path: 'docs/tasks/stage1/phase1', label: 'Stage 1 — Phase 1' },
            { phase: 2, path: 'docs/tasks/stage1/phase2', label: 'Stage 1 — Phase 2' },
          ],
        },
        {
          stage: 2,
          phases: [{ phase: 1, path: 'docs/tasks/stage2/phase1', label: 'Stage 2 — Phase 1' }],
        },
      ],
      other: [{ path: 'docs/research/board', label: 'Research board' }],
    },
    current: {
      ...current,
      other: false,
      boardPath:
        current.phase === null ? '' : `docs/tasks/stage${current.stage}/phase${current.phase}`,
    },
    currentPointer: { stage: 1, phase: 1 },
    currentPointerPath: 'docs/tasks/stage1/phase1',
    doneColumn: 'done',
  };
}

/** A nav whose pointer names no phase: no Close…, no ★. */
export function navWithoutPointer(): TasksNavState {
  return { ...handNav(), currentPointer: null, currentPointerPath: null };
}

export interface NavHost {
  setAnswering(on: boolean): void;
  failNext(): void;
}

const phasePath = (stage: number, phase: number): string =>
  `docs/tasks/stage${stage}/phase${phase}`;

/** The nav with a phase added (when missing), in order. */
function withPhase(nav: SharedTasksNav, stage: number, phase: number): SharedTasksNav {
  const next = structuredClone(nav);
  let entry = next.stages.find((candidate) => candidate.stage === stage);
  if (!entry) {
    entry = { stage, phases: [] };
    next.stages.push(entry);
    next.stages.sort((a, b) => a.stage - b.stage);
  }
  if (!entry.phases.some((candidate) => candidate.phase === phase)) {
    entry.phases.push({
      phase,
      path: phasePath(stage, phase),
      label: `Stage ${stage} — Phase ${phase}`,
    });
    entry.phases.sort((a, b) => a.phase - b.phase);
  }
  return next;
}

/** Answer the strip's ops against the nav it shows; the board gives the close candidates. */
export function attachNavHost(el: TasksNav, board: TaskBoard): NavHost {
  let stop: (() => void) | null = null;
  let failOnce = false;

  const show = (state: TasksNavState, stage: number, phase: number): void =>
    el.setState({
      ...state,
      current: { stage, phase, other: false, boardPath: phasePath(stage, phase) },
    });

  const answer = (op: AppOp<TasksNavOps>): Result<object> => {
    const state = el.navState;
    if (failOnce) {
      failOnce = false;
      return fail('HARNESS_REFUSED', 'The harness refused this op');
    }
    if (!state) return fail('NOT_FOUND', 'No nav');
    switch (op.type) {
      case 'create-stage-phase': {
        const stages = state.nav.stages;
        let stage: number;
        let phase: number;
        if (op.kind === 'stage') {
          stage = (stages[stages.length - 1]?.stage ?? 0) + 1;
          phase = 1;
        } else {
          const entry = stages.find((candidate) => candidate.stage === op.stage);
          if (!entry)
            return fail('NOT_FOUND', `Task stage with id ${op.stage ?? 'unspecified'} not found`);
          stage = entry.stage;
          phase = (entry.phases[entry.phases.length - 1]?.phase ?? 0) + 1;
        }
        show({ ...state, nav: withPhase(state.nav, stage, phase) }, stage, phase);
        return ok({ stage, phase });
      }
      case 'set-current':
        el.setState({
          ...state,
          currentPointer: { stage: op.stage, phase: op.phase },
          currentPointerPath: phasePath(op.stage, op.phase),
        });
        return ok();
      case 'close-candidates': {
        const shown = board.boardState;
        const cards = shown && shown.board.path === op.path ? shown.cards : [];
        return ok({
          cards: cards.map((card) => ({
            path: card.path,
            title: card.frontmatterTitle ?? card.title,
            column: card.column,
          })),
        });
      }
      case 'close': {
        const pointer = state.currentPointer;
        if (!pointer) {
          return fail(
            'TASKS_NO_CURRENT_POINTER',
            'tasks.yaml has no current: pointer — set a current phase first'
          );
        }
        const entry = state.nav.stages.find((candidate) => candidate.stage === pointer.stage);
        const target =
          op.kind === 'stage'
            ? { stage: pointer.stage + 1, phase: 1 }
            : {
                stage: pointer.stage,
                phase:
                  entry?.phases.find((candidate) => candidate.phase > pointer.phase)?.phase ??
                  pointer.phase + 1,
              };
        const created = !state.nav.stages.some(
          (candidate) =>
            candidate.stage === target.stage &&
            candidate.phases.some((p) => p.phase === target.phase)
        );
        show(
          {
            ...state,
            nav: withPhase(state.nav, target.stage, target.phase),
            currentPointer: target,
            currentPointerPath: phasePath(target.stage, target.phase),
          },
          target.stage,
          target.phase
        );
        return ok({ target, moved: op.paths.length, created });
      }
    }
  };

  const setAnswering = (on: boolean): void => {
    stop?.();
    stop = on ? answerOps<TasksNavOps>(el, answer) : null;
  };
  setAnswering(true);
  return { setAnswering, failNext: () => (failOnce = true) };
}
