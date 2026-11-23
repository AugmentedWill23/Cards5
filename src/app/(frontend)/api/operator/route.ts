import { createHash, timingSafeEqual } from 'node:crypto'
import { appAuth } from '@/lib/app-auth'
import { commitOperator, operatorRole } from '@/game/repository'
import { enforceRequestSafety } from '@/lib/request-safety'
import { BackendUnavailable, serviceClient } from '@/lib/supabase/server'
import type { GameCommand } from '@/game/types'
import { activateEconomy22, loadStudio, previewEconomy22, saveStudio, studioDatabaseError } from '@/game/operator-service'
import { StudioError } from '@/game/authoring'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET() {
  try {
    const user = await appAuth.currentUser(),
      role = await operatorRole(user)
    if (!role) return Response.json({ authorized: false }, { headers })
    const studio = await loadStudio(['owner','operator','economy'].includes(role))
    return Response.json(
      {
        authorized: true,
        role,
        ...studio,
        passwordRequired: !!process.env.VAULT_OPERATOR_PASSWORD,
      },
      { headers },
    )
  } catch {
    return Response.json(
      { authorized: false, error: 'Supabase operator access could not be checked.' },
      { status: 503, headers },
    )
  }
}
export async function POST(request: Request) {
  try {
    enforceRequestSafety(request, 'operator', 20)
    const user = await appAuth.currentUser(),
      role = await operatorRole(user)
    if (!user || !role)
      return Response.json(
        { error: 'Sign in with a Supabase account explicitly assigned an operator role.' },
        { status: 403, headers },
      )
    const text = await request.text()
    if (text.length > 131072) throw new Error('Operator request is too large.')
    const input = JSON.parse(text)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid operator request.')
    const secret = process.env.VAULT_OPERATOR_PASSWORD
    if (secret) {
      const digest = (v: string) => createHash('sha256').update(v).digest()
      if (
        typeof input.password !== 'string' ||
        input.password.length > 256 ||
        !timingSafeEqual(digest(input.password), digest(secret))
      )
        return Response.json(
          { error: 'Enter the private operator password.' },
          { status: 403, headers },
        )
    }
    if (input.action === 'unlock' || !input.action)
      return Response.json({ destination: '/operator' }, { headers })
    if (!['owner', 'operator', 'economy'].includes(role))
      return Response.json(
        { error: 'An economy operator role is required.' },
        { status: 403, headers },
      )
    if (['saveDesign','saveCase'].includes(input.action))
      return Response.json({ success:true,record:await saveStudio(user,input) },{headers})
    if (input.action === 'previewEconomy')
      return Response.json({ preview:await previewEconomy22(user) },{headers})
    if (input.action === 'activateEconomy')
      return Response.json({ result:await activateEconomy22(user,input) },{headers})
    if (input.action === 'command') {
      const command = input.command as GameCommand
      if (!command || !['admin', 'moderateChat'].includes(command.action))
        throw new Error('Choose an audited support operation.')
      if (command.operation === 'grantCard' && command.design && !Number.isSafeInteger(command.designRevision))
        throw new StudioError({ design:'Reload the selected design and review its current revision before granting cards.' })
      const result = await commitOperator(user, command)
      return Response.json({ result }, { headers })
    }
    if (
      input.action !== 'caseStatus' ||
      typeof input.id !== 'string' ||
      input.id.length > 160 ||
      !['published', 'paused', 'archived'].includes(input.status) ||
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 5 ||
      input.reason.length > 2000
    )
      throw new Error('Choose a case, a publication status, and a reason of 5–2000 characters.')
    if (!Number.isSafeInteger(input.revision)) throw new StudioError({ revision:'Reload the case before changing its status.' })
    const {data:pool,error:poolError} = await serviceClient().from('vault_case_pool').select('design_id,weight').eq('case_id',input.id)
    if (poolError) throw new BackendUnavailable('The case pool could not be loaded.')
    const {data,error} = await serviceClient().rpc('vault_studio_save',{
      p_user_id:user.id,p_entity:'case',p_id:input.id,p_expected_revision:input.revision,
      p_data:{status:input.status},p_pool:pool??[],p_reason:input.reason.trim(),
    })
    if (error) studioDatabaseError(error)
    return Response.json({ success: true, case: data }, { headers })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Operator action failed.',
        ...(error instanceof StudioError ? {fieldErrors:error.fields} : {}) },
      { status: error instanceof BackendUnavailable ? 503 : error instanceof StudioError && error.fields.revision ? 409 : 400, headers },
    )
  }
}
