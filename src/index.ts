/**
 * @file Splits better `DefaultQuests.json` into different files
 * for easier managment
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

import chalk from 'chalk'

import { DefaultQuests, Quest, QuestLineEntry } from './default-quests'
import { BQLangHelper, defaultLangOptions } from './lang'

const loadText = (f: string) => readFileSync(f, 'utf8')
const loadJson = (f: string) => JSON.parse(loadText(f))
const naturalSort = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

export const defaultOptions = {
  quests: 'config/betterquesting/DefaultQuests.json',
  complete: '[Complete This Chapter]',
  output: 'betterquesting',
  change: true,
} as const

const defaultLogger = { info: (_s: any) => {}, err: (_s: any) => {} }

export default async function init(
  options: typeof defaultOptions & typeof defaultLangOptions,
  log = defaultLogger
) {
  const opts = {
    ...defaultOptions,
    ...options,
  }
  const done = () => log.info(chalk.green(' done\n'))

  const langHelper = new BQLangHelper(opts)

  log.info('Loading ' + chalk.bold(opts.quests))
  if (!existsSync(opts.quests)) {
    log.err(
      `\nFile "${chalk.bold(opts.quests)}" couldnt be found. ` +
        `Specify it by --quests param\n`
    )
    process.exit(1)
  }
  let bq_raw: DefaultQuests = loadJson(opts.quests)
  done()

  log.info('Sort quests ' + chalk.bold(opts.quests))
  bq_raw = sortObjectKeys(bq_raw)
  done()

  if (opts.change) {
    log.info('Changing ' + chalk.bold('edit mode') + ' to 0')
    bq_raw['questSettings:10']['betterquesting:10']['editmode:1'] = 0
    done()

    log.info('Applying lang codes.')
    log.info(` Created files: ${await langHelper.applyLangCodes(bq_raw, log)}`)
    done()

    log.info('Connecting tail quests to  ' + chalk.bold(opts.complete))
    connectTails(bq_raw, opts)
    done()
  }

  log.info('Saving ' + chalk.bold(opts.quests))
  writeFileSync(opts.quests, serializeDefaultQuests(bq_raw))
  done()

  log.info('Splitting quests ... ')
  const totalCreatedFiles = await splitQuests(bq_raw, opts, log)
  log.info('.json files created: ' + chalk.green(totalCreatedFiles) + '\n')

  return

  // --------------------------------------------------------------------
  // --------------------------------------------------------------------
  // --------------------------------------------------------------------

  function connectTails(bq_raw: DefaultQuests, opts: typeof defaultOptions) {
    // Connect all tail quests to one
    const quests = Object.values(bq_raw['questDatabase:9'])
    quests.forEach((completeThisQuest) => {
      const complID = completeThisQuest['questID:3']
      const qName =
        completeThisQuest['properties:10']['betterquesting:10']['name:8']
      if (langHelper.localQuestName(qName) !== opts.complete) return

      completeThisQuest['preRequisites:11'] = []

      // Quest line completeThisQuest is in
      const questLine = Object.values(bq_raw['questLines:9']).find(
        (questLine) =>
          Object.values(questLine['quests:9']).find(
            (entry) => entry['id:3'] === complID
          )
      )
      if (!questLine) return

      const questsInChapter = Object.values(questLine['quests:9']).map(
        (o) => quests.find((q) => q['questID:3'] === o['id:3']) as Quest
      )

      // Keep only quests that have no other child quests
      const noChild = questsInChapter
        .filter(
          (q) =>
            !quests.some((q1) =>
              q1['preRequisites:11'].includes(q['questID:3'])
            )
        )
        .filter(
          (q) =>
            langHelper.localQuestName(
              q['properties:10']['betterquesting:10']['name:8']
            ) !== 'The chapter is complete!'
        )

      completeThisQuest['preRequisites:11'] = noChild.map((q) => q['questID:3'])

      // // Change size of technical quest
      // const completeThisQuestLine = Object.values(questLine['quests:9']).find(
      //   (ql) => ql['id:3'] === complID
      // )
      // completeThisQuestLine['sizeX:3'] = 12
      // completeThisQuestLine['sizeY:3'] = 12

      // // Quest that gives you a trophy
      // const thisIsCompleteQuest = questsInChapter.find(
      //   (q) =>
      //     localQuestName(q['properties:10']['betterquesting:10']['name:8']) ===
      //     'The chapter is complete!'
      // )

      // // Set autoclaim
      // thisIsCompleteQuest['preRequisites:11'] = [complID]
      // thisIsCompleteQuest['properties:10']['betterquesting:10']['autoclaim:1'] = 1

      // // Set Reward same as icon
      // const trophyReward = Object.values(thisIsCompleteQuest['rewards:9']).find(
      //   (r) => r['rewardID:8'] === 'bq_standard:item'
      // )
      // thisIsCompleteQuest['rewards:9'] = {
      //   '0:10':
      //     thisIsCompleteQuest['properties:10']['betterquesting:10']['icon:10'],
      // }

      // // Set Command reward with proper text
      // const trophyColorPrefix = trophyReward['rewards:9']['0:10']['tag:10'][
      //   'TrophyName:8'
      // ].substring(0, 2)
      // const questChapterName = localQuestName(
      //   questLine['properties:10']['betterquesting:10']['name:8']
      // ).replace(/§./g, '')
      // Object.values(thisIsCompleteQuest['rewards:9']).find(
      //   (r) => r['rewardID:8'] === 'bq_standard:command'
      // )[
      //   'command:8'
      // ] = `/say §lVAR_NAME§r§6 has fully completed the §n${trophyColorPrefix}${questChapterName}§r§6 chapter!§r \`\`\`Congrats!\`\`\``
    })
  }

  /**
   * Recursively sort object keys
   */
  function sortObjectKeys(obj: Record<string, any>) {
    if (typeof obj !== 'object' || Array.isArray(obj)) return obj
    return Object.keys(obj)
      .sort(naturalSort)
      .reduce((newObj, k) => {
        newObj[k] = sortObjectKeys(obj[k])
        return newObj
      }, {} as any)
  }

  /**
   * Split one huge file into many
   */
  async function splitQuests(
    bq_raw: DefaultQuests,
    opts: typeof defaultOptions,
    log: typeof defaultLogger
  ) {
    let totalFilesCreated = 0

    /**
     * Saving files functions
     * @param filename Relative path to json file
     * @param obj Object to save
     */
    function saveJSON(filename: string, obj: object) {
      totalFilesCreated++
      const filePath = join(opts.output, filename + '.json')
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(obj, null, 2))
    }

    // Remove current splitted qiests
    log.info('Remove current splitted qiests\n')
    try {
      rmSync(opts.output, { recursive: true })
    } catch (error) {}

    // Open big file
    log.info('Mapping DefaultQuests.json\n')

    // Extrct all quests
    interface CustomQuest {
      _pos: QuestLineEntry | undefined
      _data: Quest
    }
    const questMap = new Map<number, CustomQuest>()

    const bq_chapterEntries = Object.entries(bq_raw['questDatabase:9'])
    const questsIDs: (number | undefined)[] = []
    bq_chapterEntries.forEach(([i, q]) => {
      const id = q['questID:3']
      questMap.set(id, { _pos: undefined, _data: q })
      questsIDs[Number(i.split(':')[0])] = id
    })

    // Main
    const mainMap = bq_raw['questSettings:10']['betterquesting:10']
    saveJSON('_props', {
      _data: {
        'format:8': bq_raw['format:8'],
        'questSettings:10': { 'betterquesting:10': mainMap },
      },
      _IDs: questsIDs,
    })

    // Chapters
    const questChapters_entries = Object.entries(bq_raw['questLines:9'])
    log.info(`Creating ${chalk.green(questChapters_entries.length)} chapters `)

    const chapNameGen = unicNameGenerator()
    for (const [index, ch] of questChapters_entries) {
      const chapName = ch['properties:10']['betterquesting:10']['name:8']
      const folder = 'Chapters/' + chapNameGen(chapName) + '/'
      const questLines = ch['quests:9']

      // @ts-ignore
      delete ch['quests:9']

      const chapIDs = []
      const questNameGen = unicNameGenerator()
      for (const [lineIndex, q] of Object.entries(questLines)) {
        const id = q['id:3']

        // @ts-ignore
        delete q['id:3']

        const jsQuest = questMap.get(id) as CustomQuest
        jsQuest._pos = q
        chapIDs[Number(lineIndex.split(':')[0])] = id
        const qName = questNameGen(
          jsQuest._data['properties:10']['betterquesting:10']['name:8']
        )
        saveJSON(folder + qName, jsQuest)
      }

      saveJSON(folder + '_props', { _index: index, _data: ch, _IDs: chapIDs })

      log.info('.')
    }

    return totalFilesCreated
  }

  function createRealQuestFilename(name: string) {
    return langHelper
      .localQuestName(name)
      .replace(/[/\\?%*:|"<>]/g, '-') // Remove file system unsupported symbols
      .replace(/§./g, '') // Remove string formattings
  }

  // Helper naming function
  function unicNameGenerator() {
    const uniqNames = new Set<string>()
    return function (name: string) {
      const narmalName = createRealQuestFilename(name)
      let idName = narmalName
      let k = 0
      while (uniqNames.has(idName)) idName = narmalName + ' _' + k++
      uniqNames.add(idName)
      return idName
    }
  }

  function serializeDefaultQuests(jsonObj: DefaultQuests) {
    return JSON.stringify(jsonObj, null, 2)
      .replace(/^(\s*"[^:]+:6": -?\d+\.\d+)e\+(\d+,?)$/gm, '$1E$2') // Restore e+ values
      .replace(
        /^(\s*"[^:]+:6": )1(0{7,})(,?)$/gm,
        (_m, p1, p2, p3) => p1 + '1.0E' + p2.length + p3
      ) // Add e+ values for round numbers
      .replace(/^(\s*"[^:]+:(?:6|5)": -?\d+)(,?)$/gm, '$1.0$2') // Add decimal to float values
      .replace(/^\s*"[^:]+:8": ".*'.*",?$/gm, (m) => m.replace("'", '\\u0027')) // Change characters to codes
  }
}
