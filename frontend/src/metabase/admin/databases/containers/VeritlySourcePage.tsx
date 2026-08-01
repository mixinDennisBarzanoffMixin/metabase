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

type Access = { type: "public" } | { type: "connector"; tunnel: Tunnel };

export function VeritlySourcePage(props: VeritlySourcePageProps) {
  const engines = useSelector(getEngines);
  const [policy] = useState(() => new DatabaseTunnelPolicy());
  const [engine, setEngine] = useState("");
  const [access, setAccess] = useState<Access>();
  const [context] = useState(() => DatabaseTunnelContext.current());
  const selected = Object.entries(engines).find(([key]) => key === engine)?.[1];
  const found = new URLSearchParams(window.location.search).get("name");
  const name = found ? found : t`Database`;
  const tunnel = access?.type === "connector" ? access.tunnel : undefined;
  const ready = engine && (!policy.requires(selected) || access);
  const back = useCallback(() => {
    setEngine("");
    setAccess(undefined);
  }, []);
  const cancel = useCallback(() => setAccess(undefined), []);
  const connected = useCallback(
    (tunnel: Tunnel) => setAccess({ type: "connector", tunnel }),
    [],
  );
  const direct = useCallback(() => setAccess({ type: "public" }), []);
  const idle = useCallback(async () => {}, []);
  useVeritlyFlush("source", idle);

  if (ready) {
    return (
      <DatabasePage
        {...props}
        initial={{ engine, ...(tunnel ? { details: tunnel } : {}) }}
        onCancel={access?.type === "public" ? cancel : undefined}
        onEngineChange={(next) => {
          if (!next || next === engine) {
            return;
          }
          setEngine(next);
          setAccess(undefined);
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
                onPublic={direct}
                onReady={connected}
              />
            )}
          </SettingsSection>
        </Box>
      </Box>
    </Flex>
  );
}
