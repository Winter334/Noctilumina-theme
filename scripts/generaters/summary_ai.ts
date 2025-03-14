import { SiteLocals } from "hexo/dist/types"
import { createHash } from "node:crypto"
import fs from 'node:fs/promises'

const config = hexo.theme.config.summary

async function getSummaryByAPI (content:string) {
  const apiKey = config.apiKey
  const apiUrl = config.apiUrl
  const model = config.model
  const temperature = config.temperature ?? 1.3
  const initalPrompt = config.initalPrompt

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{
        role: 'system', 
        content: `${initalPrompt}`
      },{ 
        role: 'user', 
        content: `${content}` 
      }],
      temperature: temperature
    })
  })

  if (!res.ok) {
    throw new Error(`Error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  if (data.error) {
    throw new Error(`Error: ${data.error.message}`)
  }

  const summary = data.choices[0].message.content

  return summary
}

class SummaryDatabase {
  fileChanged: boolean
  data: {
    version: number
    features: {
      incremental: boolean
    }
    summaries: {
      [key: string]: {
        summary: string
        sha256: string
      }
    }
  }

  constructor() {
    this.fileChanged = false
    this.data = {
      version: 2,
      features: {
        incremental: false
      },
      summaries: {}
    }
  }

  async readDB () {
    try {
      await fs.access('summary.json')
      this.data = JSON.parse(await fs.readFile('summary.json', 'utf-8'))
    } catch (error) {
      // 无需处理数据库不存在的情况
    }
    if (this.data.version !== 2) {
      throw new Error(`Incompatible version of summary database: ${this.data.version}`)
    }
  }

  async writeDB () {
    if (this.fileChanged) {
      await fs.writeFile('summary.json', JSON.stringify(this.data))
    }
  }

  async getPostSummary (path:string, content:string) {
    const pathHash = createHash('sha256').update(path).digest('hex')
    const contentHash = createHash('sha256').update(content).digest('hex')
    if (this.data.summaries[pathHash]?.sha256 === contentHash) {
      return this.data.summaries[pathHash].summary
    } else {
      const summaryContent = await getSummaryByAPI(content)
      this.data.summaries[pathHash] = {
        summary: summaryContent,
        sha256: contentHash
      }
      this.fileChanged = true
      return summaryContent
    }
  }
}

hexo.extend.generator.register('summary_ai', async function (locals: SiteLocals) {
  const posts = locals.posts

  if (!hexo.theme.config.summary.enable) {
    return
  }

  const db = new SummaryDatabase()
  await db.readDB()

  const postArray = posts.toArray();

  const pLimit = await import('p-limit').then(module => module.default);
  const concurrencyLimit = pLimit(config.concurrency || 5); 

  const processingPromises = postArray.map(post => concurrencyLimit(async () => {
    const content = post.content;
    const path = post.path;
    const published = post.published;
    hexo.log.info(`[ShokaX Summary AI] 文章 ${path} 的摘要处理开始`);

    if (content && path && published && content.length > 0) {
      try {
        const summary = await db.getPostSummary(path, content);
        post.summary = summary;
        hexo.log.info(`[ShokaX Summary AI] 文章 ${path} 的摘要处理完成`);
      } catch (error) {
        hexo.log.error(`[ShokaX Summary AI] 处理文章 ${path} 时出错:`, error.message);
        post.summary = `${error.message}`;
      }
    }
  }));

  await Promise.all(processingPromises);
  await db.writeDB()
  hexo.log.info(`[ShokaX Summary AI] 所有文章摘要处理完成，已保存到数据库`);
})