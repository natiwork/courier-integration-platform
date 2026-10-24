import type { ReactNode } from 'react';
import type { OverviewStats } from '../../api/types';
import type { ApiState } from '../../hooks/useApi';
import { ErrorState } from '../ErrorState/ErrorState';

interface StatsBoundaryProps {
  stats: ApiState<OverviewStats>;
  // Placeholder in the shape of this widget.
  skeleton: ReactNode;
  // What failed, from the user's point of view, e.g. "Revenue couldn't be loaded".
  errorTitle: string;
  children: (stats: OverviewStats) => ReactNode;
}

// All Overview widgets read one stats request, but each shows its own loading and error state.
export function StatsBoundary({ stats, skeleton, errorTitle, children }: StatsBoundaryProps) {
  if (stats.status === 'error') {
    return (
      <ErrorState
        headingLevel={3}
        title={errorTitle}
        description={stats.error?.message ?? 'Something went wrong.'}
        onRetry={stats.reload}
      />
    );
  }
  // While refreshing, keep showing the previous numbers instead of flashing a skeleton.
  if (stats.data) return children(stats.data);
  return skeleton;
}
