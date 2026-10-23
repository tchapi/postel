import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import {
  ActionIcon,
  Button,
  CheckIcon,
  ColorSwatch,
  FileButton,
  Group,
  Kbd,
  Radio,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useDebouncedCallback } from '@mantine/hooks'
import { Link, RichTextEditor } from '@mantine/tiptap'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ArrowLeftIcon } from 'lucide-react'
import type { Settings as SettingsData } from '../types'
import { useI18n } from '../lib/i18n'
import { buildSettingsFile, parseSettingsFile, SETTINGS_FILE_NAME } from '../lib/settingsFile'
import { keyLabel, SHORTCUTS } from '../lib/shortcuts'
import { ACCENTS, ACCENT_NAMES, type AccentName } from '../theme'
import classes from './Settings.module.css'

export type ColorSchemeSetting = 'auto' | 'light' | 'dark'

export type SettingsProps = {
  settings: SettingsData
  onChange: (patch: Partial<SettingsData>) => void
  colorScheme: ColorSchemeSetting
  onColorSchemeChange: (value: ColorSchemeSetting) => void
  onClose: () => void
  onShowShortcuts: () => void
  isMobile: boolean
}

/** Radio group of colour swatches with roving focus (arrow keys move and select). */
function AccentPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: AccentName
  onChange: (accent: AccentName) => void
  labelledBy: string
}) {
  const { t } = useI18n()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!step) return
    e.preventDefault()
    const next = (ACCENT_NAMES.indexOf(value) + step + ACCENT_NAMES.length) % ACCENT_NAMES.length
    onChange(ACCENT_NAMES[next]!)
    refs.current[next]?.focus()
  }
  return (
    <Group gap={12} role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {ACCENT_NAMES.map((name, i) => {
        const checked = name === value
        return (
          <Tooltip key={name} label={t.accentNames[name]}>
            <ColorSwatch
              component="button"
              type="button"
              ref={(el: HTMLButtonElement | null) => {
                refs.current[i] = el
              }}
              role="radio"
              aria-checked={checked}
              aria-label={t.accentNames[name]}
              tabIndex={checked ? 0 : -1}
              color={ACCENTS[name][6]}
              size={30}
              withShadow={false}
              className={classes.swatch}
              style={{ '--swatch-color': ACCENTS[name][6] } as CSSProperties}
              data-checked={checked || undefined}
              onClick={() => onChange(name)}
            >
              {checked && <CheckIcon size={12} color="#ffffff" />}
            </ColorSwatch>
          </Tooltip>
        )
      })}
    </Group>
  )
}

function Row({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className={classes.row}>
      <Text id={id}>{label}</Text>
      <div>{children}</div>
    </div>
  )
}

export function Settings({
  settings,
  onChange,
  colorScheme,
  onColorSchemeChange,
  onClose,
  onShowShortcuts,
  isMobile,
}: SettingsProps) {
  const { t } = useI18n()
  const saveSignature = useDebouncedCallback(
    (html: string) => onChange({ signatureHtml: html }),
    600,
  )
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false, heading: false, codeBlock: false }), Link],
    content: settings.signatureHtml,
    immediatelyRender: true,
    onUpdate: ({ editor: e }) => saveSignature(e.getHTML()),
  })
  const [fromName, setFromName] = useState(settings.fromName)
  const saveFromName = useDebouncedCallback((value: string) => onChange({ fromName: value }), 600)
  const resetFile = useRef<() => void>(null)

  const exportFile = () => {
    const json = JSON.stringify(buildSettingsFile(settings), null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = SETTINGS_FILE_NAME
    link.click()
    // Safari cancels the download when the URL goes away right after the click
    setTimeout(() => URL.revokeObjectURL(url))
  }

  const importFile = async (file: File | null) => {
    if (!file) return
    resetFile.current?.()
    try {
      const patch = parseSettingsFile(await file.text())
      onChange(patch)
      if (patch.fromName !== undefined) setFromName(patch.fromName)
      if (patch.signatureHtml !== undefined) editor?.commands.setContent(patch.signatureHtml)
      notifications.show({ message: t.importDone, color: 'gray', autoClose: 3000 })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: t.importFailed,
        message: error instanceof Error ? error.message : '',
      })
    }
  }

  return (
    // Full width so the scrollbar sits at the window's edge, not after the centred column
    <Stack gap={0} h="100%" style={{ flex: 1, minWidth: 0 }}>
      {isMobile && (
        <Group gap={4} px={4} className={classes.mobileHeader}>
          <ActionIcon size={44} aria-label={t.back} onClick={onClose}>
            <ArrowLeftIcon size={22} strokeWidth={1.75} />
          </ActionIcon>
          <Title order={1} size="h2">
            {t.settings}
          </Title>
        </Group>
      )}
      <ScrollArea style={{ flex: 1, minHeight: 0 }} type="hover" scrollbars="y">
        <Stack gap={0} className={classes.page} px={isMobile ? 16 : 40} py={isMobile ? 4 : 28}>
          {!isMobile && (
            <Group gap={12} pb={20}>
              <Title order={1} style={{ flex: 1 }}>
                {t.settings}
              </Title>
              <Text size="xs" c="dimmed">
                {t.changesSaved}
              </Text>
              <Button
                variant="default"
                size="xs"
                onClick={onClose}
                rightSection={<Kbd size="xs">{keyLabel('Escape')}</Kbd>}
              >
                {t.close}
              </Button>
            </Group>
          )}

          <section aria-labelledby="s-appearance" className={classes.section}>
            <Text id="s-appearance" className={classes.heading}>
              {t.appearance}
            </Text>
            <Row label={t.theme} id="l-theme">
              <SegmentedControl
                aria-labelledby="l-theme"
                fullWidth={isMobile}
                value={colorScheme}
                onChange={(v) => onColorSchemeChange(v as ColorSchemeSetting)}
                data={[
                  { value: 'auto', label: t.themeAuto },
                  { value: 'light', label: t.themeLight },
                  { value: 'dark', label: t.themeDark },
                ]}
              />
            </Row>
            <Row label={t.accent} id="l-accent">
              <Group gap={16}>
                <AccentPicker
                  value={settings.accent}
                  onChange={(accent) => onChange({ accent })}
                  labelledBy="l-accent"
                />
                {!isMobile && (
                  <Text size="sm" c="dimmed">
                    {t.accentNames[settings.accent]} · {t.accentHint}
                  </Text>
                )}
              </Group>
            </Row>
            <Row label={t.density} id="l-density">
              <Group gap={12}>
                <SegmentedControl
                  aria-labelledby="l-density"
                  fullWidth={isMobile}
                  value={settings.density}
                  onChange={(v) => onChange({ density: v as SettingsData['density'] })}
                  data={[
                    { value: 'comfortable', label: t.comfortable },
                    { value: 'compact', label: t.compact },
                  ]}
                />
                {!isMobile && (
                  <Text size="sm" c="dimmed">
                    {t.densityHint}
                  </Text>
                )}
              </Group>
            </Row>
            <Row label={t.language} id="l-lang">
              <SegmentedControl
                aria-labelledby="l-lang"
                fullWidth={isMobile}
                value={settings.language}
                onChange={(v) => onChange({ language: v as SettingsData['language'] })}
                data={[
                  { value: 'en', label: 'English' },
                  { value: 'fr', label: 'Français' },
                ]}
              />
            </Row>
          </section>

          <section aria-labelledby="s-reading" className={classes.section}>
            <Text id="s-reading" className={classes.heading}>
              {t.reading}
            </Text>
            <Row label={t.remoteImages} id="l-images">
              <Radio.Group
                aria-labelledby="l-images"
                value={settings.remoteImages}
                onChange={(v) => onChange({ remoteImages: v as SettingsData['remoteImages'] })}
              >
                <Stack gap={10}>
                  <Radio value="block" label={t.blockImages} description={t.blockImagesHint} />
                  <Radio value="always" label={t.alwaysShow} />
                  {settings.allowedSenders.length > 0 && (
                    <Text size="sm" c="dimmed">
                      {t.allowedSenders(settings.allowedSenders.length)}
                    </Text>
                  )}
                </Stack>
              </Radio.Group>
            </Row>
            <Row label={t.conversations} id="l-threads">
              <Switch
                aria-labelledby="l-threads"
                label={t.groupByConversation}
                checked={settings.threads}
                onChange={(e) => onChange({ threads: e.currentTarget.checked })}
              />
            </Row>
          </section>

          <section aria-labelledby="s-signature" className={classes.section}>
            <Text id="s-signature" className={classes.heading}>
              {t.writing}
            </Text>
            <Row label={t.fromName} id="l-from-name">
              <TextInput
                aria-labelledby="l-from-name"
                placeholder={t.fromNamePlaceholder}
                value={fromName}
                maxLength={200}
                onChange={(e) => {
                  setFromName(e.currentTarget.value)
                  saveFromName(e.currentTarget.value)
                }}
              />
            </Row>
            <Row label={t.signature} id="l-signature">
              <RichTextEditor editor={editor} aria-labelledby="l-signature">
                <RichTextEditor.Toolbar>
                  <RichTextEditor.ControlsGroup>
                    <RichTextEditor.Bold />
                    <RichTextEditor.Italic />
                    <RichTextEditor.Underline />
                    <RichTextEditor.Link />
                  </RichTextEditor.ControlsGroup>
                </RichTextEditor.Toolbar>
                <RichTextEditor.Content className={classes.signature} />
              </RichTextEditor>
            </Row>
          </section>

          <section aria-labelledby="s-backup" className={classes.section}>
            <Text id="s-backup" className={classes.heading}>
              {t.backup}
            </Text>
            <Row label={t.backup} id="l-backup">
              <Stack gap={8}>
                <Group gap={8}>
                  <Button variant="default" size="xs" onClick={exportFile}>
                    {t.exportSettings}
                  </Button>
                  <FileButton
                    onChange={(file) => void importFile(file)}
                    accept=".json,application/json"
                    resetRef={resetFile}
                  >
                    {(props) => (
                      <Button variant="default" size="xs" {...props}>
                        {t.importSettings}
                      </Button>
                    )}
                  </FileButton>
                </Group>
                <Text size="sm" c="dimmed">
                  {t.backupHint}
                </Text>
              </Stack>
            </Row>
          </section>

          {!isMobile && (
            <section aria-labelledby="s-keys" className={classes.section}>
              <Group gap={24} wrap="nowrap" align="center">
                <Text id="s-keys" className={classes.heading} w={200} mb={0}>
                  {t.shortcuts}
                </Text>
                <Group gap={14}>
                  {(['next', 'archive', 'reply', 'compose', 'search'] as const).map((id) => (
                    <Group key={id} gap={6} wrap="nowrap">
                      <Kbd size="xs">{SHORTCUTS[id].keys.map(keyLabel).join(' ')}</Kbd>
                      <Text size="sm" c="dimmed">
                        {t.shortcutLabels[id]}
                      </Text>
                    </Group>
                  ))}
                  <Button
                    variant="default"
                    size="xs"
                    onClick={onShowShortcuts}
                    rightSection={<Kbd size="xs">?</Kbd>}
                  >
                    {t.allShortcuts}
                  </Button>
                </Group>
              </Group>
            </section>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  )
}
