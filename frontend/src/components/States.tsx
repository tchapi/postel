import type { ReactNode } from 'react'
import { Box, Button, Group, Skeleton, Stack, Text } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react'
import { useI18n } from '../lib/i18n'

/** One line of text + icon. No illustrations. */
export function StateMessage({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <Stack
      align="center"
      justify="center"
      gap={10}
      h="100%"
      mih={160}
      p="lg"
      c="dimmed"
      ta="center"
    >
      {icon}
      <Text c="var(--mantine-color-text)">{title}</Text>
      {children}
    </Stack>
  )
}

export function ErrorState({
  title,
  onRetry,
  compact,
}: {
  title: string
  onRetry: () => void
  compact?: boolean
}) {
  const { t } = useI18n()
  return (
    <Box role="alert" h="100%">
      <StateMessage icon={<IconAlertCircle size={compact ? 20 : 24} stroke={1.5} />} title={title}>
        <Button
          variant="default"
          size={compact ? 'xs' : 'sm'}
          leftSection={<IconRefresh size={15} stroke={1.75} />}
          onClick={onRetry}
        >
          {t.retry}
        </Button>
      </StateMessage>
    </Box>
  )
}

const widths = [
  ['45%', '75%', '90%'],
  ['55%', '60%', '85%'],
  ['38%', '70%', '80%'],
  ['50%', '65%', '92%'],
] as const

export function ListSkeleton({ rowHeight, rows = 8 }: { rowHeight: number; rows?: number }) {
  const reduced = useReducedMotion()
  return (
    <Box aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => {
        const w = widths[i % widths.length]!
        return (
          <Stack
            key={i}
            gap={8}
            h={rowHeight}
            justify="center"
            pl={38}
            pr={14}
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Skeleton h={11} w={w[0]} animate={!reduced} />
              <Skeleton h={10} w={36} animate={!reduced} />
            </Group>
            <Skeleton h={10} w={w[1]} animate={!reduced} />
            <Skeleton h={10} w={w[2]} animate={!reduced} />
          </Stack>
        )
      })}
    </Box>
  )
}

export function ReaderSkeleton() {
  const reduced = useReducedMotion()
  return (
    <Stack gap={14} p={32} aria-busy="true">
      <Skeleton h={18} w="60%" animate={!reduced} />
      <Group gap={12} wrap="nowrap">
        <Skeleton h={40} w={40} circle animate={!reduced} />
        <Stack gap={6} style={{ flex: 1 }}>
          <Skeleton h={10} w="40%" animate={!reduced} />
          <Skeleton h={10} w="25%" animate={!reduced} />
        </Stack>
      </Group>
      <Skeleton h={10} w="100%" animate={!reduced} />
      <Skeleton h={10} w="92%" animate={!reduced} />
      <Skeleton h={10} w="64%" animate={!reduced} />
    </Stack>
  )
}

export function FolderNavSkeleton({ collapsed }: { collapsed: boolean }) {
  const reduced = useReducedMotion()
  return (
    <Stack gap={14} p="sm" aria-busy="true">
      {['60%', '70%', '50%', '55%', '65%', '45%'].map((w) => (
        <Group key={w} gap={10} wrap="nowrap">
          <Skeleton h={16} w={16} animate={!reduced} />
          {!collapsed && <Skeleton h={10} w={w} animate={!reduced} />}
        </Group>
      ))}
    </Stack>
  )
}
