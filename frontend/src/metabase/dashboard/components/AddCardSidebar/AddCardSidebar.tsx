import { useCallback } from "react";

import { Sidebar } from "metabase/common/components/Sidebar";
import { addUniverChartDashCardToDashboard } from "metabase/dashboard/actions/cards-typed";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/redux";
import type { UniverChartRef } from "metabase/veritly/univer";
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

  const handleAddUniverChart = useCallback(
    (chart: UniverChartRef) => {
      if (!dashboard) return;
      dispatch(
        addUniverChartDashCardToDashboard({
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
        onSelectUniverChart={handleAddUniverChart}
      />
    </Sidebar>
  );
}
