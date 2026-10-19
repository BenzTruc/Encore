import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Confirm } from '@/components/Sheet';

interface Ask { title: string; text: ReactNode; ok?: string; danger?: boolean }
/** Promise-based confirmation sheet: `if (await ask({...})) …` */
export function useConfirm() {
  const [state, setState] = useState<Ask | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const ask = useCallback((a: Ask) => new Promise<boolean>((res) => { resolver.current = res; setState(a); }), []);
  const node = <Confirm open={!!state} title={state?.title || ''} text={state?.text} ok={state?.ok} danger={state?.danger} onAnswer={(yes) => { setState(null); resolver.current(yes); }} />;
  return [node, ask] as const;
}
