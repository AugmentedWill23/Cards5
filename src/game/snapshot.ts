import { gzipSync, gunzipSync } from 'node:zlib'
import type { World } from './types'

type EncodedSnapshot = { encoding: 'gzip-base64-v1'; data: string }

// The Wasmer Node-compatible runtime caps individual Buffers at 16 MiB. Store
// a normal concatenated gzip stream made of small independent members so the
// raw JSON can grow beyond that cap without ever inflating into one large Buffer.
const CHUNK_CHARACTERS = 256 * 1024
const CHUNK_MAX_OUTPUT = 2 * 1024 * 1024
// The database limits the JSONB snapshot envelope to 16 MiB. Base64 adds 4/3,
// so keep the compressed bytes well below that limit with room for the wrapper.
const MAX_COMPRESSED_BYTES = 11 * 1024 * 1024
const LEGACY_MAX_OUTPUT = 16 * 1024 * 1024
const CHUNK_SUBFIELD_1 = 0x56 // V
const CHUNK_SUBFIELD_2 = 0x43 // C

function* jsonChunks(value: string): Generator<string> {
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + CHUNK_CHARACTERS, value.length)
    // Do not split a UTF-16 surrogate pair between independently encoded members.
    if (end < value.length) {
      const last = value.charCodeAt(end - 1)
      const next = value.charCodeAt(end)
      if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--
    }
    yield value.slice(start, end)
    start = end
  }
}

function encodeGzipMember(text: string): Buffer {
  const gzip = gzipSync(Buffer.from(text, 'utf8'))
  if (gzip.length < 18 || gzip[0] !== 0x1f || gzip[1] !== 0x8b || gzip[3] !== 0)
    throw new Error('The runtime produced an unsupported gzip member.')

  // Add a standard gzip FEXTRA subfield containing this member's total length.
  // Ordinary gzip readers ignore the subfield and still decode concatenated members.
  const header = Buffer.from(gzip.subarray(0, 10))
  header[3] |= 0x04
  const extra = Buffer.alloc(10)
  extra.writeUInt16LE(8, 0) // XLEN
  extra[2] = CHUNK_SUBFIELD_1
  extra[3] = CHUNK_SUBFIELD_2
  extra.writeUInt16LE(4, 4) // subfield length
  extra.writeUInt32LE(gzip.length + extra.length, 6)
  return Buffer.concat([header, extra, gzip.subarray(10)])
}

function chunkedGzipMembers(data: Buffer): Buffer[] | null {
  const members: Buffer[] = []
  let offset = 0
  while (offset < data.length) {
    if (
      data.length - offset < 20 ||
      data[offset] !== 0x1f ||
      data[offset + 1] !== 0x8b ||
      data[offset + 2] !== 0x08 ||
      data[offset + 3] !== 0x04
    )
      return null

    const extraLength = data.readUInt16LE(offset + 10)
    const extraStart = offset + 12
    const extraEnd = extraStart + extraLength
    if (extraEnd + 8 > data.length) return null

    let memberLength: number | undefined
    for (let position = extraStart; position + 4 <= extraEnd;) {
      const fieldLength = data.readUInt16LE(position + 2)
      const fieldData = position + 4
      if (fieldData + fieldLength > extraEnd) return null
      if (
        data[position] === CHUNK_SUBFIELD_1 &&
        data[position + 1] === CHUNK_SUBFIELD_2 &&
        fieldLength === 4
      )
        memberLength = data.readUInt32LE(fieldData)
      position = fieldData + fieldLength
    }

    if (
      memberLength == null ||
      memberLength < extraEnd - offset + 8 ||
      memberLength > data.length - offset
    )
      return null
    members.push(data.subarray(offset, offset + memberLength))
    offset += memberLength
  }
  return members.length ? members : null
}

export function encodeSnapshot(state: World): EncodedSnapshot {
  const json = JSON.stringify(state)
  const members: Buffer[] = []
  let compressedBytes = 0
  for (const chunk of jsonChunks(json)) {
    const member = encodeGzipMember(chunk)
    compressedBytes += member.length
    if (compressedBytes > MAX_COMPRESSED_BYTES)
      throw new Error('The economy snapshot exceeds the safe compressed storage limit.')
    members.push(member)
  }
  const stream = Buffer.concat(members, compressedBytes)
  return { encoding: 'gzip-base64-v1', data: stream.toString('base64') }
}

export function decodeSnapshot(value: unknown): World {
  let decoded = value
  if (value && typeof value === 'object' && 'encoding' in value) {
    const envelope = value as EncodedSnapshot
    if (envelope.encoding !== 'gzip-base64-v1' || typeof envelope.data !== 'string')
      throw new Error('Unsupported economy snapshot encoding')

    const compressed = Buffer.from(envelope.data, 'base64')
    const members = chunkedGzipMembers(compressed)
    const json = members
      ? members
          .map((member) => gunzipSync(member, { maxOutputLength: CHUNK_MAX_OUTPUT }).toString('utf8'))
          .join('')
      : gunzipSync(compressed, { maxOutputLength: LEGACY_MAX_OUTPUT }).toString('utf8')
    decoded = JSON.parse(json)
  }
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    !('players' in decoded) ||
    !('cards' in decoded) ||
    !('requests' in decoded) ||
    !('counters' in decoded)
  )
    throw new Error('Invalid economy snapshot')
  return decoded as World
}
