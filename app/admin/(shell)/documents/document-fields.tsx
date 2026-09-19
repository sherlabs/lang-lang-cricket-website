import { Field, FileInput, Select, TextInput } from '@/components/admin/fields'

export const CATEGORIES = ['Codes of Conduct', 'Policies', 'Child Safety', 'Game Day', 'CCCA Directory']

type Doc = { id: number; category: string; title: string; url: string }

/** Shared between the add card and the edit dialog; field names match the server actions. */
export function DocumentFields({ doc }: { doc?: Doc }) {
  const p = doc ? `doc-${doc.id}` : 'doc-new'
  return (
    <>
      {doc && <input type="hidden" name="id" value={doc.id} />}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label="Category" htmlFor={`${p}-category`}>
          <Select id={`${p}-category`} name="category" defaultValue={doc?.category ?? CATEGORIES[0]} required>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Title" htmlFor={`${p}-title`}>
          <TextInput id={`${p}-title`} name="title" defaultValue={doc?.title} placeholder="e.g. Junior code of conduct" required />
        </Field>
      </div>
      <Field
        label={doc ? 'Replace PDF' : 'PDF file'}
        htmlFor={`${p}-file`}
        hint={doc ? 'Leave empty to keep the current file.' : 'PDF only.'}
      >
        <FileInput id={`${p}-file`} name="file" accept="application/pdf" required={!doc} />
      </Field>
    </>
  )
}
