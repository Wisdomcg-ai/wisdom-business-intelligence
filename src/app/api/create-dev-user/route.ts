import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Development endpoint to create test users
// Access at: http://localhost:3000/api/create-dev-user
// PROTECTED: Requires super_admin role

export async function GET() {
  const supabase = await createRouteHandlerClient()

  try {
    // Verify user is authenticated and is super_admin
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('system_role')
      .eq('id', user.id)
      .single()

    if (userData?.system_role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }
    // Create test users
    const testUsers = [
      { email: 'test@example.com', password: 'test123', name: 'Test User' },
      { email: 'demo@example.com', password: 'demo123', name: 'Demo User' },
      { email: 'admin@example.com', password: 'admin123', name: 'Admin User' }
    ]
    
    const results = []
    
    for (const user of testUsers) {
      // Try to sign up
      const { data, error } = await supabase.auth.signUp({
        email: user.email,
        password: user.password,
        options: {
          data: {
            full_name: user.name
          }
        }
      })
      
      if (error) {
        results.push({
          email: user.email,
          status: 'error',
          message: error.message
        })
      } else {
        results.push({
          email: user.email,
          status: 'created',
          message: 'Check email for confirmation'
        })
      }
    }
    
    return NextResponse.json({
      message: 'Development users creation attempted',
      results,
      instructions: [
        '1. Check the email inboxes for confirmation links',
        '2. Or run the SQL script to auto-confirm them',
        '3. Then login with the credentials'
      ]
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}