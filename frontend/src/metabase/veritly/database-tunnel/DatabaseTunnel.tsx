import { useEffect, useState } from "react";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import {
  Alert,
  Box,
  Button,
  Code,
  Flex,
  Group,
  Icon,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import {
  type Connector,
  DatabaseTunnelModel,
  type Tunnel,
  type TunnelState,
} from "./model";

interface DatabaseTunnelProps {
  name: string;
  onBack: () => void;
  onReady: (tunnel: Tunnel) => void;
}

export function DatabaseTunnel({ name, onBack, onReady }: DatabaseTunnelProps) {
  const [session, setSession] = useState<{
    model: DatabaseTunnelModel;
    state: TunnelState;
  }>();

  useEffect(() => {
    const model = new DatabaseTunnelModel(name);
    const stop = model.subscribe((state) => setSession({ model, state }));
    void model.start();
    return () => {
      stop();
      model.dispose();
    };
  }, [name]);

  useEffect(() => {
    if (session?.state.tunnel) {
      onReady(session.state.tunnel);
    }
  }, [onReady, session?.state.tunnel]);

  if (!session || session.state.view === "loading") {
    return (
      <Stack gap="lg" data-testid="database-tunnel">
        <Box>
          <Title order={2} fz="h3">{t`Connect to the private database`}</Title>
          <Text c="text-secondary" mt="xs">
            {t`Run a Veritly connector in the same private network as this database. It connects outbound; the database stays private.`}
          </Text>
        </Box>
        <Flex align="center" justify="center" gap="sm" mih="10rem">
          <Loader size="sm" />
          <Text c="text-secondary">{t`Waiting for private network access…`}</Text>
        </Flex>
        {session?.state.error && (
          <Alert color="error" icon={<Icon name="warning" />}>
            {session.state.error}
          </Alert>
        )}
      </Stack>
    );
  }

  const model = session.model;
  const state = session.state;

  return (
    <Stack gap="lg" data-testid="database-tunnel">
      <Box>
        <Title order={2} fz="h3">{t`Connect to the private database`}</Title>
        <Text c="text-secondary" mt="xs">
          {t`Run a Veritly connector in the same private network as this database. It connects outbound; the database stays private.`}
        </Text>
      </Box>

      {state.view === "existing" && (
        <Stack gap="md">
          <Text fw="bold">{t`Available connectors`}</Text>
          <Stack gap="sm">
            {state.connectors
              .filter((connector) =>
                ["online", "degraded", "unreachable"].includes(connector.state),
              )
              .map((connector) => (
                <ConnectorButton
                  key={connector.id}
                  connector={connector}
                  disabled={state.busy}
                  onClick={() => void model.choose(connector)}
                />
              ))}
          </Stack>
          <Group justify="space-between">
            <Button variant="subtle" onClick={onBack}>
              {t`Back to database types`}
            </Button>
            <Button variant="default" onClick={() => model.install()}>
              {t`Set up another connector`}
            </Button>
          </Group>
        </Stack>
      )}

      {state.view === "technology" && (
        <Stack gap="md">
          <Text fw="bold">{t`Where does the database run?`}</Text>
          <Button
            variant="default"
            justify="space-between"
            rightSection={<Icon name="chevronright" />}
            onClick={() => void model.deploy("docker")}
            disabled={state.busy}
          >
            {t`Docker server`}
          </Button>
          <Group>
            <Button variant="subtle" onClick={onBack}>
              {t`Back to database types`}
            </Button>
          </Group>
        </Stack>
      )}

      {state.view === "deploy" && <Deployment state={state} model={model} />}

      {state.error && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {state.error}
        </Alert>
      )}
    </Stack>
  );
}

function ConnectorButton({
  connector,
  disabled,
  onClick,
}: {
  connector: Connector;
  disabled: boolean;
  onClick: () => void;
}) {
  const status =
    connector.state === "online"
      ? t`Connected`
      : connector.state === "degraded"
        ? t`Connected with one session`
        : t`Connected, database currently unreachable`;
  return (
    <Button
      variant="default"
      h="auto"
      py="sm"
      justify="space-between"
      disabled={disabled}
      onClick={onClick}
      rightSection={<Icon name="chevronright" />}
    >
      <Box ta="left">
        <Text fw="bold">{connector.name}</Text>
        <Text c="text-secondary" fz="sm">
          {status} · {connector.platform}
        </Text>
      </Box>
    </Button>
  );
}

function Deployment({
  state,
  model,
}: {
  state: TunnelState;
  model: DatabaseTunnelModel;
}) {
  const expires = state.expires
    ? new Date(state.expires).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <Stack gap="lg">
      <Box>
        <Title order={3} fz="h4">{t`Run on your Docker server`}</Title>
        <Text c="text-secondary" mt="xs">
          {t`This one-time setup code expires at ${expires}. This page will continue automatically when the connector comes online.`}
        </Text>
      </Box>

      <Text c="text-secondary">
        {t`Replace <database-network> with the Docker network used by the database, then run this on that server.`}
      </Text>

      <Paper withBorder p="md">
        <Flex justify="space-between" align="start" gap="md">
          <Code
            block
            data-testid="connector-command"
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {model.command()}
          </Code>
          <CopyButton value={model.command()} />
        </Flex>
      </Paper>

      <Alert color="info" icon={<Loader size="xs" />}>
        {t`Waiting for the connector to come online. You can leave this page open; no Continue button is required.`}
      </Alert>

      <Group>
        <Button variant="subtle" onClick={() => model.back()}>
          {t`Back`}
        </Button>
      </Group>
    </Stack>
  );
}
