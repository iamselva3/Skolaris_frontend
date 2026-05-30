import { Check } from 'lucide-react';
import { Fragment } from 'react';
import { cn } from '@/lib/utils/cn';

export interface StepperStep {
  key: string;
  title: string;
}

interface Props {
  steps: StepperStep[];
  current: string;
  onChange?: (key: string) => void;
  className?: string;
}

export const Stepper = ({ steps, current, onChange, className }: Props) => {
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <div className={cn('stepper', className)} role="tablist">
      {steps.map((s, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'future';
        const clickable = Boolean(onChange) && i <= currentIdx;
        return (
          <Fragment key={s.key}>
            <button
              type="button"
              role="tab"
              aria-selected={state === 'active'}
              disabled={!clickable}
              onClick={() => onChange?.(s.key)}
              className={cn('stepper-step', clickable && 'cursor-pointer', !clickable && 'cursor-default')}
            >
              <span
                className={cn(
                  'stepper-circle',
                  state === 'future' && 'stepper-circle-future',
                  state === 'active' && 'stepper-circle-active',
                  state === 'done' && 'stepper-circle-done',
                )}
              >
                {state === 'done' ? <Check size={12} /> : i + 1}
              </span>
              <span
                className={cn(
                  'stepper-title',
                  state === 'future' && 'stepper-title-future',
                  state === 'active' && 'stepper-title-active',
                  state === 'done' && 'stepper-title-done',
                )}
              >
                {s.title}
              </span>
            </button>
            {i < steps.length - 1 ? <span className="stepper-line" aria-hidden="true" /> : null}
          </Fragment>
        );
      })}
    </div>
  );
};
