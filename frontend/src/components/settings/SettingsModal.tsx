import {
  Button,
  Divider,
  FileButton,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, RichTextEditor } from '@mantine/tiptap'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useRef, useState } from 'react'

import { type Density, type Settings, useUpdateSettings } from '../../api/settings'
import { buildSettingsFile, parseSettingsFile, SETTINGS_FILE_NAME } from '../../lib/settingsFile'

type Props = {
  settings: Settings
  opened: boolean
  onClose: () => void
}

export function SettingsModal({ settings, opened, onClose }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Settings" size="lg">
      {opened && <SettingsForm settings={settings} onClose={onClose} />}
    </Modal>
  )
}

function SettingsForm({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const [fromName, setFromName] = useState(settings.fromName ?? '')
  const [loadRemoteImages, setLoadRemoteImages] = useState(settings.loadRemoteImages)
  const [density, setDensity] = useState<Density>(settings.density)
  const update = useUpdateSettings()

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: settings.signature ?? '',
  })

  const submit = () => {
    const html = editor?.getHTML() ?? ''
    update.mutate(
      {
        fromName: fromName.trim() || null,
        signature: editor?.getText().trim() ? html : null,
        loadRemoteImages,
        density,
      },
      {
        onSuccess: () => {
          notifications.show({ message: 'Settings saved' })
          onClose()
        },
        onError: () => notifications.show({ color: 'red', message: 'Could not save the settings' }),
      },
    )
  }

  const resetFileRef = useRef<() => void>(null)

  const exportFile = () => {
    const json = JSON.stringify(buildSettingsFile(settings), null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = SETTINGS_FILE_NAME
    link.click()
    setTimeout(() => URL.revokeObjectURL(url))
  }

  const importFile = async (file: File | null) => {
    if (!file) return
    // so picking the same file again still fires onChange
    resetFileRef.current?.()
    try {
      const imported = parseSettingsFile(await file.text())
      setFromName(imported.fromName ?? '')
      setLoadRemoteImages(imported.loadRemoteImages)
      setDensity(imported.density)
      editor?.commands.setContent(imported.signature ?? '')
      notifications.show({
        title: 'Settings loaded',
        message: 'Check them and press Save to keep them',
      })
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Could not import the settings',
        message: error instanceof Error ? error.message : 'Unreadable file',
      })
    }
  }

  return (
    <Stack gap="md">
      <TextInput
        label="Name on sent mail"
        description="Leave empty to use the name from your login"
        value={fromName}
        onChange={(e) => setFromName(e.currentTarget.value)}
      />

      <div>
        <Text size="sm" fw={500} mb={4}>
          Signature
        </Text>
        <RichTextEditor editor={editor} mih={120}>
          <RichTextEditor.Toolbar>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>
          <RichTextEditor.Content />
        </RichTextEditor>
      </div>

      <Switch
        label="Load remote images"
        description="Images hosted on the internet reveal that you opened the message"
        checked={loadRemoteImages}
        onChange={(e) => setLoadRemoteImages(e.currentTarget.checked)}
      />

      <div>
        <Text size="sm" fw={500} mb={4}>
          Message list
        </Text>
        <SegmentedControl
          value={density}
          onChange={(value) => setDensity(value as Density)}
          data={[
            { label: 'Comfortable', value: 'comfortable' },
            { label: 'Compact', value: 'compact' },
          ]}
        />
      </div>

      <Divider mt="xs" />

      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Import / export
        </Text>
        <Group gap="xs">
          <Button variant="default" size="xs" onClick={exportFile}>
            Export
          </Button>
          <FileButton
            onChange={(file) => void importFile(file)}
            accept=".json,application/json"
            resetRef={resetFileRef}
          >
            {(props) => (
              <Button variant="default" size="xs" {...props}>
                Import…
              </Button>
            )}
          </FileButton>
        </Group>
      </div>

      <Group justify="flex-end" mt="sm">
        <Button variant="subtle" color="gray" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={update.isPending}>
          Save
        </Button>
      </Group>
    </Stack>
  )
}
