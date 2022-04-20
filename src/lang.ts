/**
 * @file This script lookup all non-lang strings in BetterQuesting Book
 * and replace them with codes, creating .lang file entries
 *
 * @author Krutoy242
 * @link https://github.com/Krutoy242
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, parse } from 'path'

import chalk from 'chalk'
import glob from 'glob'
import { Memoize } from 'typescript-memoize'

import { DefaultQuests } from './default-quests'

const loadText = (f: string) => readFileSync(f, 'utf8')
const naturalSort = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

export const defaultLangOptions = {
  langPath: 'resources/betterquesting/lang/',
  langPrefix: 'bq',
} as const

const argsJoin = (...args: string[]) => args.join()
const defaultLogger = { info: (_s: any) => {}, err: (_s: any) => {} }

export class BQLangHelper {
  private readonly opts: typeof defaultLangOptions

  constructor(options: typeof defaultLangOptions) {
    this.opts = {
      ...defaultLangOptions,
      ...options,
    }
  }

  async applyLangCodes(bq_raw: DefaultQuests, log = defaultLogger) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    const validCodes = glob
      .sync(join(self.opts.langPath, '*.lang'))
      .map((f) => parse(f).name)

    if (validCodes.length <= 0) {
      log.info(` No .lang files found. Using ${chalk.bold('en_us')} as default`)
      validCodes.push('en_us')
      // log.err(
      //   `\nDirectory ${chalk.bold(self.opts.langPath)} ` +
      //     `should content one or more ${chalk.bold('.lang')} files, ` +
      //     `that would be populated with ${chalk.bold(
      //       '"lang.code=localized string"'
      //     )} pairs.\n`
      // )
    }

    const usedLangCodes = new Set<string>()
    const langFiles = validCodes.map((c) => this.getLangFile(c))
    let totalChanges = 0

    // Quests
    Object.entries(bq_raw['questDatabase:9']).forEach(([, q]) => {
      checkAndAdd(q, 'quest' + q['questID:3'], 'name')
      checkAndAdd(q, 'quest' + q['questID:3'], 'desc')
    })

    // Chapters
    Object.entries(bq_raw['questLines:9']).forEach(([, q]) => {
      checkAndAdd(q, 'chapter' + q['lineID:3'], 'name')
      checkAndAdd(q, 'chapter' + q['lineID:3'], 'desc')
    })

    // Save lang files
    validCodes.forEach((code, i) => saveLang(code, langFiles[i]))

    return totalChanges

    // --------------------------------------------------------------------
    // --------------------------------------------------------------------
    // --------------------------------------------------------------------

    function checkAndAdd(json_obj: any, lang_root: string, fieldName: string) {
      const bq_props = json_obj['properties:10']['betterquesting:10']
      const bq_key = fieldName + ':8'
      const text = bq_props[bq_key]

      if (self.isLangCode(text)) {
        if (langFiles[0][text] === undefined) undefinedLangCode(text)
        usedLangCodes.add(text)
        return
      }

      const langCode = `${self.opts.langPrefix}.${lang_root}.${fieldName}`
      langFiles.forEach((l) => (l[langCode] = text))
      if (bq_props[bq_key] !== langCode) {
        totalChanges++
        usedLangCodes.add(langCode)
      }
      bq_props[bq_key] = langCode
    }

    function undefinedLangCode(langCode: string) {
      langFiles.forEach((l) => (l[langCode] = '[undefined lang code]'))
    }

    function saveLang(
      langCode: string,
      langFile: { [langCode: string]: string }
    ) {
      const lFile = Object.entries(langFile)
        .filter(([langCode]) => usedLangCodes.has(langCode))
        .sort(([a_key], [b_key]) => {
          const [, a1, a2] = a_key.split('.')
          const [, b1, b2] = b_key.split('.')
          // @ts-ignore
          return naturalSort(a1, b1) || b2 - a2
        })

      const filePath = self.getLangPath(langCode)
      mkdirSync(parse(filePath).dir, { recursive: true })
      writeFileSync(
        filePath,
        lFile.map(([k, v]) => `${k}=${v.replace(/\n/g, '%n')}`).join('\n')
      )
    }
  }

  // Lang file with quest names
  localQuestName(name: string): string {
    if (!this.isLangCode(name)) return name
    return this.getLangFile('en_us')[name] ?? name
  }

  private isLangCode(text: string) {
    return !!text.match(/^(\w+\.)+\w+$/)
  }

  private getLangPath(langCode: string) {
    return this.opts.langPath + langCode + '.lang'
  }

  @Memoize(argsJoin)
  private getLangFile(langCode: string): { [langKey: string]: string } {
    const langPath = this.getLangPath(langCode)
    if (!existsSync(langPath)) return {}
    return Object.fromEntries(
      loadText(langPath)
        .split('\n')
        .map((l) => [
          l.substring(0, l.indexOf('=')),
          l.substring(l.indexOf('=') + 1),
        ])
    )
  }
}
