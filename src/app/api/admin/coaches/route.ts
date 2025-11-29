import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@/lib/supabase/server'

// Initialize Supabase admin client for user creation
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function GET() {
  try {
    const supabase = await createRouteHandlerClient()

    // Verify caller is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleData?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Get all coaches
    const { data: coaches, error } = await supabase
      .from('users')
      .select('*')
      .eq('system_role', 'coach')
      .order('first_name')

    if (error) {
      console.error('Error fetching coaches:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ coaches: coaches || [] })
  } catch (error) {
    console.error('Error in GET /api/admin/coaches:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()

    // Verify caller is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleData?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()
    const { email, firstName, lastName, phone, password } = body

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Email, first name, and last name are required' },
        { status: 400 }
      )
    }

    // Generate a temporary password if not provided
    const tempPassword = password || Math.random().toString(36).slice(-12) + 'A1!'

    // Create auth user using admin client
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        first_name: firstName,
        last_name: lastName
      }
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    const newUserId = authData.user.id

    // Insert into users table
    const { error: usersError } = await supabaseAdmin
      .from('users')
      .insert({
        id: newUserId,
        email,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        system_role: 'coach'
      })

    if (usersError) {
      console.error('Error inserting into users table:', usersError)
      // Try to clean up the auth user if users insert fails
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    // Insert into system_roles table
    const { error: rolesError } = await supabaseAdmin
      .from('system_roles')
      .insert({
        user_id: newUserId,
        role: 'coach'
      })

    if (rolesError) {
      console.error('Error inserting into system_roles:', rolesError)
      // Non-critical - don't fail the whole operation
    }

    return NextResponse.json({
      success: true,
      coach: {
        id: newUserId,
        email,
        first_name: firstName,
        last_name: lastName,
        phone
      },
      tempPassword: password ? undefined : tempPassword // Only return if we generated it
    })
  } catch (error) {
    console.error('Error in POST /api/admin/coaches:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()

    // Verify caller is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleData?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const coachId = searchParams.get('id')

    if (!coachId) {
      return NextResponse.json({ error: 'Coach ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const { firstName, lastName, email, phone } = body

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: 'First name, last name, and email are required' },
        { status: 400 }
      )
    }

    // Update the users table
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', coachId)

    if (updateError) {
      console.error('Error updating coach:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Also update auth user metadata and email
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(coachId, {
      email,
      user_metadata: {
        first_name: firstName,
        last_name: lastName
      }
    })

    if (authError) {
      console.error('Error updating auth user:', authError)
      // Non-critical - don't fail the whole operation
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in PATCH /api/admin/coaches:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient()

    // Verify caller is admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: roleData } = await supabase
      .from('system_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleData?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const coachId = searchParams.get('id')

    if (!coachId) {
      return NextResponse.json({ error: 'Coach ID is required' }, { status: 400 })
    }

    // Delete from auth (cascades to users and system_roles due to FK)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(coachId)

    if (deleteError) {
      console.error('Error deleting coach:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/admin/coaches:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
