import {
  Button,
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
import { useState } from 'react'

import { type Density, type Settings, useUpdateSettings } from '../../api/settings'

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
