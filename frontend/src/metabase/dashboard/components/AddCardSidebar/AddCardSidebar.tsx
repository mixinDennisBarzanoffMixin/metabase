import { useCallback } from "react";

import { Sidebar } from "metabase/common/components/Sidebar";
import { addVeritlyChartDashCardToDashboard } from "metabase/dashboard/actions/cards-typed";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/redux";
import type { VeritlyChartRef } from "metabase/veritly/charts";
import type { CardId } from "metabase-types/api";

import { QuestionPicker } from "../QuestionPicker";

export function AddCardSidebar() {
  const { dashboard, selectedTabId, addCardToDashboard } =
    useDashboardContext();
  const dispatch = useDispatch();

  const handleAddCard = useCallback(
    (cardId: string | number) => {
      if (dashboard) {
        addCardToDashboard({
          dashId: dashboard.id,
          cardId: cardId as CardId,
          tabId: selectedTabId,
        });
      }
    },
    [addCardToDashboard, dashboard, selectedTabId],
  );

  const handleAddChart = useCallback(
    (chart: VeritlyChartRef) => {
      if (!dashboard) {
        return;
      }
      dispatch(
        addVeritlyChartDashCardToDashboard({
          dashId: dashboard.id,
          chart,
          tabId: selectedTabId,
        }),
      );
    },
    [dashboard, dispatch, selectedTabId],
  );

  return (
    <Sidebar data-testid="add-card-sidebar">
      <QuestionPicker
        onSelect={handleAddCard}
        onSelectVeritlyChart={handleAddChart}
      />
    </Sidebar>
  );
}
