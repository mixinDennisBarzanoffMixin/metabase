import { useCallback, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { DatabaseEngineList } from "metabase/databases/components/DatabaseEngineList";
import { getEngines } from "metabase/databases/selectors";
import { useSelector } from "metabase/redux";
import { Box, Flex, ScrollArea, Text, Title } from "metabase/ui";
import { DatabaseTunnel } from "metabase/veritly/database-tunnel/DatabaseTunnel";
import {
  DatabaseTunnelContext,
  DatabaseTunnelPolicy,
  type Tunnel,
} from "metabase/veritly/database-tunnel/model";
import { useVeritlyFlush } from "metabase/veritly/flush";

import { DatabasePage } from "./DatabasePage";

interface VeritlySourcePageProps {
  params: { databaseId?: string };
  route: Route;
}

export function VeritlySourcePage(props: VeritlySourcePageProps) {
  const engines = useSelector(getEngines);
  const [policy] = useState(() => new DatabaseTunnelPolicy());
  const [engine, setEngine] = useState("");
  const [tunnel, setTunnel] = useState<Tunnel>();
  const [context] = useState(() => DatabaseTunnelContext.current());
  const selected = Object.entries(engines).find(([key]) => key === engine)?.[1];
  const found = new URLSearchParams(window.location.search).get("name");
  const name = found ? found : t`Database`;
  const ready = engine && (!policy.requires(selected) || tunnel);
  const back = useCallback(() => {
    setEngine("");
    setTunnel(undefined);
  }, []);
  const connected = useCallback((details: Tunnel) => setTunnel(details), []);
  const idle = useCallback(async () => {}, []);
  useVeritlyFlush("source", idle);

  if (ready) {
    return (
      <DatabasePage
        {...props}
        initial={{ engine, ...(tunnel ? { details: tunnel } : {}) }}
        onEngineChange={(next) => {
          if (!next || next === engine) {
            return;
          }
          setEngine(next);
          setTunnel(undefined);
        }}
      />
    );
  }

  return (
    <Flex direction="row" h="100%" bg="background_page-secondary">
      <Box h="100%" w="100%" component={ScrollArea}>
        <Box w="100%" maw="54rem" mx="auto" p={{ base: "md", sm: "xl" }}>
          <Title order={1} fz="h2" mb="lg">
            {t`Add a database`}
          </Title>
          <SettingsSection>
            {!engine ? (
              <Box maw="36rem">
                <Title order={2} fz="h3">
                  {t`Choose your database`}
                </Title>
                <Text c="text-secondary" mt="xs" mb="lg">
                  {t`Select the database first. Private-network setup only appears for database types that support it.`}
                </Text>
                <DatabaseEngineList onSelect={setEngine} />
              </Box>
            ) : (
              <DatabaseTunnel
                key={`${context.source}:${engine}`}
                name={name}
                onBack={back}
                onReady={connected}
              />
            )}
          </SettingsSection>
        </Box>
      </Box>
    </Flex>
  );
}
