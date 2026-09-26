export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          restaurant_name: string
          role: 'owner' | 'manager' | 'staff'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          restaurant_name: string
          role?: 'owner' | 'manager' | 'staff'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          restaurant_name?: string
          role?: 'owner' | 'manager' | 'staff'
          updated_at?: string
        }
      }
      temperature_records: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          equipment_name: string
          record_type: 'cooking' | 'cooling' | 'cold_storage' | 'hot_holding' | 'reheating' | 'probe_calibration'
          food_item: string
          temperature: number
          unit: string
          min_safe_temp: number
          max_safe_temp: number
          is_safe: boolean
          notes: string
          recorded_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          equipment_name: string
          record_type: 'cooking' | 'cooling' | 'cold_storage' | 'hot_holding' | 'reheating' | 'probe_calibration'
          food_item: string
          temperature: number
          unit?: string
          min_safe_temp: number
          max_safe_temp: number
          is_safe: boolean
          notes?: string
          recorded_at?: string
          created_at?: string
        }
        Update: {
          equipment_name?: string
          record_type?: 'cooking' | 'cooling' | 'cold_storage' | 'hot_holding' | 'reheating' | 'probe_calibration'
          food_item?: string
          temperature?: number
          min_safe_temp?: number
          max_safe_temp?: number
          is_safe?: boolean
          notes?: string
        }
      }
      daily_checks: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          check_type: 'opening' | 'closing'
          checklist_items: any
          completed: boolean
          completed_at: string
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          check_type: 'opening' | 'closing'
          checklist_items: any
          completed?: boolean
          completed_at?: string
          notes?: string
          created_at?: string
        }
        Update: {
          checklist_items?: any
          completed?: boolean
          completed_at?: string
          notes?: string
        }
      }
      cleaning_records: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          task_name: string
          area: string
          frequency: 'daily' | 'weekly' | 'monthly'
          completed: boolean
          completed_at: string
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          task_name: string
          area: string
          frequency: 'daily' | 'weekly' | 'monthly'
          completed?: boolean
          completed_at?: string
          notes?: string
          created_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string
          notes?: string
        }
      }
      allergen_records: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          menu_item: string
          allergens: string[]
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          menu_item: string
          allergens: string[]
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          menu_item?: string
          allergens?: string[]
          notes?: string
          updated_at?: string
        }
      }
      delivery_records: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          supplier_name: string
          delivery_date: string
          items: any
          temperature: number
          is_accepted: boolean
          rejection_reason: string
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          supplier_name: string
          delivery_date: string
          items: any
          temperature: number
          is_accepted: boolean
          rejection_reason?: string
          notes?: string
          created_at?: string
        }
        Update: {
          supplier_name?: string
          items?: any
          temperature?: number
          is_accepted?: boolean
          rejection_reason?: string
          notes?: string
        }
      }
      corrective_actions: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          issue_description: string
          severity: 'low' | 'medium' | 'high' | 'critical'
          action_taken: string
          resolved: boolean
          resolved_at: string
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          issue_description: string
          severity: 'low' | 'medium' | 'high' | 'critical'
          action_taken: string
          resolved?: boolean
          resolved_at?: string
          notes?: string
          created_at?: string
        }
        Update: {
          issue_description?: string
          severity?: 'low' | 'medium' | 'high' | 'critical'
          action_taken?: string
          resolved?: boolean
          resolved_at?: string
          notes?: string
        }
      }
      pest_control: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          inspection_date: string
          findings: string
          action_taken: string
          next_inspection_date: string
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          inspection_date: string
          findings: string
          action_taken: string
          next_inspection_date: string
          notes?: string
          created_at?: string
        }
        Update: {
          inspection_date?: string
          findings?: string
          action_taken?: string
          next_inspection_date?: string
          notes?: string
        }
      }
      training_records: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          staff_name: string
          training_topic: string
          training_date: string
          expiry_date: string
          certificate_url: string
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          staff_name: string
          training_topic: string
          training_date: string
          expiry_date: string
          certificate_url?: string
          notes?: string
          created_at?: string
        }
        Update: {
          staff_name?: string
          training_topic?: string
          training_date?: string
          expiry_date?: string
          certificate_url?: string
          notes?: string
        }
      }
      equipment: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          name: string
          type: string
          min_safe_temp: number
          max_safe_temp: number
          location: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          name: string
          type: string
          min_safe_temp: number
          max_safe_temp: number
          location?: string
          created_at?: string
        }
        Update: {
          name?: string
          type?: string
          min_safe_temp?: number
          max_safe_temp?: number
          location?: string
        }
      }
    }
  }
}
