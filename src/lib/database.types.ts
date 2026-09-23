export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  section?: string
}

export interface DeliveryItemJson {
  name: string
  quantity: number
  unit: string
}

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
          checklist_items: ChecklistItem[]
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
          checklist_items: ChecklistItem[]
          completed?: boolean
          completed_at?: string
          notes?: string
          created_at?: string
        }
        Update: {
          checklist_items?: ChecklistItem[]
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
          items: DeliveryItemJson[]
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
          items: DeliveryItemJson[]
          temperature: number
          is_accepted: boolean
          rejection_reason?: string
          notes?: string
          created_at?: string
        }
        Update: {
          supplier_name?: string
          items?: DeliveryItemJson[]
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
      documents: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          doc_category: string
          category_id: string | null
          title: string
          description: string
          file_name: string
          file_data: string
          file_size: number | null
          file_type: string | null
          expiry_date: string | null
          notification_months: number | null
          uploaded_by: string
          doc_month: number | null
          doc_year: number | null
          uploaded_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          doc_category: string
          category_id?: string | null
          title: string
          description?: string
          file_name: string
          file_data: string
          file_size?: number | null
          file_type?: string | null
          expiry_date?: string | null
          notification_months?: number | null
          uploaded_by: string
          doc_month?: number | null
          doc_year?: number | null
          uploaded_at?: string | null
          notes?: string | null
        }
        Update: {
          title?: string
          description?: string
          category_id?: string | null
          file_name?: string
          file_data?: string
          expiry_date?: string | null
          notes?: string | null
        }
      }
      corporate_inspections: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          inspection_date: string
          inspector_name: string
          inspector_role: string
          sections: unknown
          overall_score: number | null
          max_score: number | null
          rating: string | null
          strengths: string | null
          improvements: string | null
          action_items: unknown
          signed_off: boolean
          notes: string | null
          quarter: string | null
          report_file_name: string | null
          report_data: string | null
          rubric_source: string | null
          rubric_link: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          inspection_date: string
          inspector_name: string
          inspector_role: string
          sections?: unknown
          overall_score?: number | null
          max_score?: number | null
          rating?: string | null
          strengths?: string | null
          improvements?: string | null
          action_items?: unknown
          notes?: string | null
          quarter?: string | null
          report_file_name?: string | null
          report_data?: string | null
          rubric_source?: string | null
          rubric_link?: string | null
        }
        Update: {
          sections?: unknown
          overall_score?: number | null
          max_score?: number | null
          rating?: string | null
          strengths?: string | null
          improvements?: string | null
          action_items?: unknown
          notes?: string | null
          quarter?: string | null
          report_file_name?: string | null
          report_data?: string | null
          rubric_source?: string | null
          rubric_link?: string | null
        }
      }
      inhouse_inspections: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          inspection_date: string
          inspector_name: string
          sections: unknown
          overall_score: number | null
          max_score: number | null
          notes: string | null
          quarter: string | null
          report_file_name: string | null
          report_data: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          inspection_date: string
          inspector_name: string
          sections?: unknown
          overall_score?: number | null
          max_score?: number | null
          notes?: string | null
          quarter?: string | null
          report_file_name?: string | null
          report_data?: string | null
        }
        Update: {
          sections?: unknown
          overall_score?: number | null
          max_score?: number | null
          notes?: string | null
          quarter?: string | null
        }
      }
      staff_licenses: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          staff_name: string
          license_type: string
          file_name: string
          file_url: string
          file_data: string | null
          file_size: string | null
          issue_date: string | null
          expiry_date: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          staff_name: string
          license_type: string
          file_name: string
          file_url: string
          file_data?: string | null
          file_size?: string | null
          issue_date?: string | null
          expiry_date?: string | null
          notes?: string | null
        }
        Update: {
          staff_name?: string
          license_type?: string
          file_name?: string
          file_url?: string
          file_data?: string | null
          file_size?: string | null
          issue_date?: string | null
          expiry_date?: string | null
          notes?: string | null
        }
      }
      marketing_promotions: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          title: string
          description: string | null
          file_name: string | null
          file_url: string | null
          file_data: string | null
          file_size: string | null
          month: number
          year: number
          status: string
          material_type: string | null
          size: string | null
          is_store_request: boolean | null
          requested_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          title: string
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          file_data?: string | null
          file_size?: string | null
          month: number
          year: number
          status?: string
          material_type?: string | null
          size?: string | null
          is_store_request?: boolean | null
          requested_date?: string | null
        }
        Update: {
          title?: string
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          file_data?: string | null
          status?: string
          material_type?: string | null
          size?: string | null
          is_store_request?: boolean | null
          requested_date?: string | null
          updated_at?: string
        }
      }
      print_manuals: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          title: string
          description: string | null
          file_name: string
          file_url: string
          file_data: string | null
          file_size: string | null
          category: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          title: string
          description?: string | null
          file_name: string
          file_url: string
          file_data?: string | null
          file_size?: string | null
          category?: string | null
        }
        Update: {
          title?: string
          description?: string | null
          file_name?: string | null
          file_url?: string | null
          file_data?: string | null
          file_size?: string | null
          category?: string | null
        }
      }
      steps_to_do: {
        Row: {
          id: string
          user_id: string | null
          restaurant_name: string
          scenario: string
          title: string | null
          subtitle: string | null
          icon: string | null
          steps: unknown
          last_updated: string | null
          updated_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          restaurant_name: string
          scenario: string
          title?: string | null
          subtitle?: string | null
          icon?: string | null
          steps?: unknown
          last_updated?: string | null
          updated_by?: string | null
        }
        Update: {
          title?: string | null
          subtitle?: string | null
          icon?: string | null
          steps?: unknown
          last_updated?: string | null
          updated_by?: string | null
        }
      }
      login_information: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          system_name: string
          service_name: string | null
          category: string | null
          url: string | null
          username: string
          password_encrypted: string
          notes: string | null
          last_updated: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          system_name: string
          service_name?: string | null
          category?: string | null
          url?: string | null
          username?: string
          password_encrypted?: string
          notes?: string | null
          last_updated?: string
        }
        Update: {
          system_name?: string
          service_name?: string | null
          category?: string | null
          url?: string | null
          username?: string
          password_encrypted?: string
          notes?: string | null
          last_updated?: string
        }
      }
      emergency_contacts: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          category: string
          company_name: string
          phone_1: string | null
          phone_2: string | null
          phone_3: string | null
          contact_name: string | null
          email: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          category: string
          company_name: string
          phone_1?: string | null
          phone_2?: string | null
          phone_3?: string | null
          contact_name?: string | null
          email?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          company_name?: string
          phone_1?: string | null
          phone_2?: string | null
          phone_3?: string | null
          contact_name?: string | null
          email?: string | null
          notes?: string | null
          updated_at?: string
        }
      }
      employee_handbooks: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          title: string
          file_name: string
          file_data: string
          file_type: string | null
          version: string | null
          uploaded_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          title?: string
          file_name: string
          file_data: string
          file_type?: string | null
          version?: string | null
          uploaded_at?: string | null
        }
        Update: {
          title?: string
          file_name?: string
          file_data?: string
          file_type?: string | null
          version?: string | null
          uploaded_at?: string | null
        }
      }
      handbook_signatures: {
        Row: {
          id: string
          handbook_id: string | null
          staff_name: string
          role: string | null
          method: string | null
          acknowledged_version: string | null
          acknowledged_content: string | null
          user_id: string | null
          signed_at: string
        }
        Insert: {
          id?: string
          handbook_id?: string | null
          staff_name: string
          role?: string | null
          method?: string | null
          acknowledged_version?: string | null
          acknowledged_content?: string | null
          user_id?: string | null
          signed_at?: string
        }
        Update: {
          staff_name?: string
          role?: string | null
          method?: string | null
          acknowledged_version?: string | null
          acknowledged_content?: string | null
          handbook_id?: string | null
          user_id?: string | null
          signed_at?: string
        }
      }
      restaurant_opening_checklist: {
        Row: {
          id: string
          user_id: string
          restaurant_name: string
          target_open_date: string | null
          completed: unknown
          checklist_name: string | null
          sections: unknown
          status: string | null
          updated_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          restaurant_name: string
          target_open_date?: string | null
          completed?: unknown
          checklist_name?: string | null
          sections?: unknown
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          target_open_date?: string | null
          completed?: unknown
          checklist_name?: string | null
          sections?: unknown
          status?: string | null
          updated_at?: string | null
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
