import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Development endpoint to create test users
// Access at: http://localhost:3000/api/create-dev-user

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  
  try {
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