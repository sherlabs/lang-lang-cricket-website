import { clubDefaults } from '../seed/club-defaults'

/** Browser tab title: "Events — Lang Lang Cricket Club Website Admin". */
export const adminTitleSuffix = ` — ${clubDefaults.name} Website Admin`

/**
 * Plain-English overrides for Payload's built-in wording (English only). Placeholders such as
 * {{label}} and <1>{{title}}</1> must stay exactly as Payload writes them.
 */
export const adminTranslations = {
  en: {
    general: {
      aboutToDelete: 'You are about to delete the {{label}} <1>{{title}}</1>. This takes it off the website and cannot be undone. Are you sure?',
      aboutToDeleteCount_one: 'You are about to delete {{count}} {{label}}. This takes it off the website and cannot be undone.',
      aboutToDeleteCount_other: 'You are about to delete {{count}} {{label}}. This takes them off the website and cannot be undone.',
      aboutToDeleteCount_many: 'You are about to delete {{count}} {{label}}. This takes them off the website and cannot be undone.',
      confirmDeletion: 'Delete for good?',
      createNew: 'Add new',
      noResults: 'Nothing here yet. Use the "Add new" button to create the first one.',
      updatedSuccessfully: 'Saved. Your change is now on the website.',
      deletedSuccessfully: 'Deleted.',
    },
    validation: {
      required: 'Please fill this in.',
      emailAddress: 'That does not look like an email address. Check for typos.',
    },
  },
}
